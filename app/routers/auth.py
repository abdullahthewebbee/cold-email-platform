"""Authentication API routes: register, login, token refresh, API key management."""
from __future__ import annotations

import logging
import secrets
from datetime import datetime, timedelta

from fastapi import (
    APIRouter,
    BackgroundTasks,
    Depends,
    File,
    Form,
    HTTPException,
    Request,
    Response,
    UploadFile,
    status,
)
from pydantic import BaseModel, Field, field_validator
from sqlalchemy import select, func
from sqlalchemy.ext.asyncio import AsyncSession

from app.rate_limit import limiter, check_account_lockout, record_failed_login, clear_failed_logins
from app.auth import (
    ACCESS_TOKEN_EXPIRE_MINUTES,
    create_access_token,
    create_refresh_token,
    decode_token,
    get_current_user,
    hash_api_key,
    hash_password,
    is_setup_complete,
    require_admin,
    verify_password,
)
from app.backup_manifest import collect_backup_manifest
from app.backup_package import (
    BackupPackageError,
    read_backup_metadata,
    read_password_hint,
    unpack_backup,
)
from app.backup_pg import BackupToolError, BackupUnsupportedError, validate_dump_bytes_async
from app.backup_restore_ops import restore_database_from_path
from app.backup_restore_staging import (
    consume_staged_dump,
    delete_staged_dump,
    purge_expired_staging,
    stage_decrypted_dump,
)
from app.client_ip import client_ip_from_request
from app.database import AsyncSessionLocal, get_db
from app.restore_preview_rate import allow_restore_preview
from app.models import APIKey, User
from app.time import utcnow

log = logging.getLogger("quickly.auth.routes")

router = APIRouter(prefix="/api/auth", tags=["auth"])


# ---------------------------------------------------------------------------
# Schemas
# ---------------------------------------------------------------------------

class RegisterRequest(BaseModel):
    username: str = Field(min_length=3, max_length=150)
    email: str = Field(min_length=5, max_length=255)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("username")
    @classmethod
    def username_alphanumeric(cls, v: str) -> str:
        if not v.replace("_", "").replace("-", "").isalnum():
            raise ValueError("Username must contain only letters, numbers, hyphens, and underscores")
        return v.lower()

    @field_validator("email")
    @classmethod
    def email_format(cls, v: str) -> str:
        if "@" not in v or "." not in v.split("@")[-1]:
            raise ValueError("Invalid email format")
        return v.lower()

    @field_validator("password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if len(v) < 8:
            raise ValueError("Password must be at least 8 characters")
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.islower() for c in v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        return v


class LoginRequest(BaseModel):
    username: str
    password: str


class ChangePasswordRequest(BaseModel):
    current_password: str = ""
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.islower() for c in v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        return v


class CreateAPIKeyRequest(BaseModel):
    name: str = Field(min_length=1, max_length=255)
    scopes: list[str] = []
    expires_in_days: int | None = None  # None = no expiry


class APIKeyResponse(BaseModel):
    id: int
    name: str
    prefix: str
    scopes: list[str]
    revoked: bool
    last_used_at: datetime | None
    expires_at: datetime | None
    created_at: datetime

    class Config:
        from_attributes = True


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"
    expires_in: int = ACCESS_TOKEN_EXPIRE_MINUTES * 60
    refresh_token: str | None = None  # only populated for non-cookie clients (e.g. browser extension)


class UserResponse(BaseModel):
    id: int
    username: str
    email: str
    role: str
    is_active: bool
    created_at: datetime
    has_password: bool = False
    is_owner: bool = False

    class Config:
        from_attributes = True

    @field_validator("has_password", mode="before")
    @classmethod
    def _compute_has_password(cls, v, info):
        return v


# ---------------------------------------------------------------------------
# Setup check endpoint (publicly accessible)
# ---------------------------------------------------------------------------


@router.get("/setup-status")
async def setup_status(db: AsyncSession = Depends(get_db)):
    """Check if initial setup (first user registration) is complete."""
    done = await is_setup_complete(db)
    return {"setup_complete": done}


STAGING_KIND_RESTORE_SETUP = "restore-setup"


class RestoreSetupExecuteBody(BaseModel):
    restore_token: str = Field(..., min_length=10, max_length=256)


@router.post("/restore-setup/metadata")
async def restore_setup_metadata(
    request: Request,
    file: UploadFile = File(...),
):
    """Backup summary from file only (no password); same rate limit as restore preview."""
    ip = client_ip_from_request(request) or "unknown"
    if not allow_restore_preview(ip):
        raise HTTPException(
            status_code=429,
            detail="Too many restore attempts. Try again later.",
        )
    async with AsyncSessionLocal() as db:
        if await is_setup_complete(db):
            raise HTTPException(
                status_code=403,
                detail="Setup already complete. Sign in and use Settings → Backup to restore.",
            )
    raw = await file.read()
    if not raw or len(raw) < 32:
        raise HTTPException(status_code=400, detail="Invalid or empty backup file")
    try:
        backup_preview, encrypted, hint = read_backup_metadata(raw)
    except BackupPackageError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    async with AsyncSessionLocal() as db:
        current = await collect_backup_manifest(db, encrypted=False)
    return {
        "backup_preview": backup_preview,
        "encrypted": encrypted,
        "password_required": encrypted,
        "password_hint": hint or "",
        "current_database": current,
    }


@router.post("/restore-setup/preview")
async def restore_setup_preview(
    request: Request,
    file: UploadFile = File(...),
    password: str = Form(""),
):
    """Validate backup and return manifest + token; does not modify the database."""
    ip = client_ip_from_request(request) or "unknown"
    if not allow_restore_preview(ip):
        raise HTTPException(
            status_code=429,
            detail="Too many restore preview attempts. Try again later.",
        )
    async with AsyncSessionLocal() as db:
        if await is_setup_complete(db):
            raise HTTPException(
                status_code=403,
                detail="Setup already complete. Sign in and use Settings → Backup to restore.",
            )
    raw = await file.read()
    if not raw or len(raw) < 32:
        raise HTTPException(status_code=400, detail="Invalid or empty backup file")
    purge_expired_staging()
    pw = (password or "").strip() or None
    try:
        manifest, dump = unpack_backup(raw, password=pw)
    except BackupPackageError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    try:
        await validate_dump_bytes_async(dump)
    except BackupToolError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    async with AsyncSessionLocal() as db:
        current = await collect_backup_manifest(db, encrypted=False)
    token, ttl = stage_decrypted_dump(dump, kind=STAGING_KIND_RESTORE_SETUP)
    hint = read_password_hint(raw)
    return {
        "restore_token": token,
        "expires_in_seconds": ttl,
        "password_hint": hint or "",
        "backup": manifest,
        "current_database": current,
    }


@router.post("/restore-setup/execute")
async def restore_setup_execute(
    body: RestoreSetupExecuteBody,
    background_tasks: BackgroundTasks,
    response: Response,
):
    """Run restore after :func:`restore_setup_preview` returned a token."""
    async with AsyncSessionLocal() as db:
        if await is_setup_complete(db):
            raise HTTPException(
                status_code=403,
                detail="Setup already complete. Sign in and use Settings → Backup to restore.",
            )
    path = consume_staged_dump(body.restore_token, expected_kind=STAGING_KIND_RESTORE_SETUP)
    if path is None:
        raise HTTPException(
            status_code=400,
            detail="Invalid or expired restore confirmation. Run preview again.",
        )
    try:
        await restore_database_from_path(path, background_tasks)
    except BackupUnsupportedError:
        raise HTTPException(status_code=501, detail="Restore requires PostgreSQL.")
    except BackupToolError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    finally:
        delete_staged_dump(path)
    log.warning("Database restored from backup during pre-setup flow")
    response.headers["X-Quickly-Reload"] = "1"
    return {"ok": True, "detail": "Database restored; you can sign in or create an admin account."}


# ---------------------------------------------------------------------------
# Registration & Login
# ---------------------------------------------------------------------------

@router.post("/register", response_model=UserResponse, status_code=201)
@limiter.limit("5/hour")
async def register(request: Request, data: RegisterRequest, db: AsyncSession = Depends(get_db)):
    """Register a new user with username & password.

    Every signup gets its own fresh Organization and becomes its admin —
    matches the self-serve behavior Google/Microsoft OAuth login already
    has (see app/routers/app_oauth.py::_resolve_user_and_login).
    """
    from app.models import Organization

    existing = await db.execute(
        select(User).where((User.username == data.username) | (User.email == data.email))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Username or email already taken")

    new_org = Organization(name=f"{data.username}'s Organization")
    db.add(new_org)
    await db.flush()

    user = User(
        org_id=new_org.id,
        username=data.username,
        email=data.email,
        password_hash=hash_password(data.password),
        role="admin",
        is_owner=True,
        is_active=True,
    )
    db.add(user)
    await db.flush()

    import secrets as _secrets
    from datetime import timedelta as _timedelta
    from app.models import EmailVerificationToken
    from app.system_mail import send_system_email

    token = _secrets.token_urlsafe(48)
    verification = EmailVerificationToken(
        user_id=user.id,
        token=token,
        expires_at=utcnow() + _timedelta(hours=24),
    )
    db.add(verification)
    await db.flush()
    await db.commit()

    base_url = "http://localhost:8000"  # TODO: use your real production domain here
    verify_link = f"{base_url}/api/auth/verify-email?token={token}"
    sent = send_system_email(
        to_email=user.email,
        subject="Verify your Emissary account",
        body=(
            f"Hi {user.username},\n\n"
            f"Thanks for signing up for Emissary. Please verify your email address "
            f"by clicking the link below. This link expires in 24 hours.\n\n"
            f"{verify_link}\n\n"
        ),
    )
    if not sent:
        log.error("register: failed to send verification email to %s", user.email)

    log.info("New user registered via password: %s (own org=%s) - verification email sent", user.username, new_org.id)
    return user

@router.post("/login", response_model=TokenResponse)
@limiter.limit("10/minute")
async def login(request: Request, data: LoginRequest, response: Response, db: AsyncSession = Depends(get_db)):
    """Authenticate and return JWT tokens."""
    check_account_lockout(data.username)

    result = await db.execute(select(User).where(User.username == data.username.lower()))
    user = result.scalar_one_or_none()

    if not user or not verify_password(data.password, user.password_hash):
        record_failed_login(data.username)
        raise HTTPException(status_code=401, detail="Invalid credentials")

    if not user.is_active:
        raise HTTPException(status_code=403, detail="Account disabled")

    if not user.is_verified:
        raise HTTPException(status_code=403, detail="Please verify your email address before logging in. Check your inbox for the verification link.")

    clear_failed_logins(data.username)
    access_token = create_access_token(user.id, user.role)
    refresh_token = create_refresh_token(user.id, user.role)

    # Set httpOnly cookie for the refresh token scoped to the auth prefix
    response.set_cookie(
        key="refresh_token",
        value=refresh_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=7 * 24 * 60 * 60,  # 7 days
        path="/api/auth",
    )
    # Also set the access token as an httpOnly cookie so logged-in browsers
    # can reach API endpoints and top-level OAuth redirects (e.g. /oauth/google/authorize)
    # without needing a custom Authorization header. Path must be "/" so /oauth/* receives it.
    response.set_cookie(
        key="access_token",
        value=access_token,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )

    # Audit: login
    try:
        from app.audit import audit
        from app.database import AsyncSessionLocal
        async with AsyncSessionLocal() as _db:
            await audit(_db, request, user, "login", detail={"username": user.username})
            await _db.commit()
    except Exception:
        pass

    return TokenResponse(access_token=access_token, refresh_token=refresh_token)


class RefreshRequest(BaseModel):
    refresh_token: str | None = None


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(request: Request, response: Response, body: RefreshRequest | None = None, db: AsyncSession = Depends(get_db)):
    """Exchange a refresh token for a new access token.

    The web app uses the httpOnly cookie (unaffected by this change). Non-cookie
    clients (e.g. the browser extension, which can't rely on Secure cookies over
    plain HTTP) may instead pass the refresh token in the request body.
    """
    token = request.cookies.get("refresh_token") or (body.refresh_token if body else None)
    if not token:
        raise HTTPException(status_code=401, detail="No refresh token")

    payload = decode_token(token)
    if payload.get("type") != "refresh":
        raise HTTPException(status_code=401, detail="Invalid token type")

    user_id = payload.get("sub")
    user = await db.get(User, int(user_id))
    if not user or not user.is_active:
        raise HTTPException(status_code=401, detail="User not found or disabled")

    # Issue new tokens (refresh token rotation)
    new_access = create_access_token(user.id, user.role)
    new_refresh = create_refresh_token(user.id, user.role)

    response.set_cookie(
        key="refresh_token",
        value=new_refresh,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=7 * 24 * 60 * 60,
        path="/api/auth",
    )
    # Rotate the access token cookie; clear legacy path="/api" so it cannot shadow the new one
    response.delete_cookie("access_token", path="/api")
    response.set_cookie(
        key="access_token",
        value=new_access,
        httponly=True,
        secure=True,
        samesite="lax",
        max_age=ACCESS_TOKEN_EXPIRE_MINUTES * 60,
        path="/",
    )

    return TokenResponse(access_token=new_access, refresh_token=new_refresh)


@router.post("/logout")
async def logout(response: Response):
    """Clear auth cookies (refresh + access; access may exist at legacy path /api)."""
    response.delete_cookie("refresh_token", path="/api/auth")
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("access_token", path="/api")
    return {"detail": "Logged out"}


# ---------------------------------------------------------------------------
# Current user
# ---------------------------------------------------------------------------


@router.delete("/me")
async def delete_my_account(
    confirm: str = "",
    response: Response = None,
    db: AsyncSession = Depends(get_db),
    user=Depends(get_current_user),
):
    """Delete the current user's account.

    If this user is the sole member of their organization, the entire
    organization and all its data (campaigns, leads, inboxes, etc.) is
    permanently deleted. If other users share the organization, only this
    user's own account is removed and shared org data is left intact.
    """
    if confirm != "DELETE":
        raise HTTPException(400, 'Type "DELETE" to confirm account deletion')

    from app.account_deletion import delete_organization_and_data
    from app.models import User as _User
    from sqlalchemy import select as _select, func as _func

    if user.org_id is not None:
        count_result = await db.execute(
            _select(_func.count()).select_from(_User).where(_User.org_id == user.org_id)
        )
        member_count = count_result.scalar() or 0
        if member_count <= 1:
            await delete_organization_and_data(db, user.org_id)
        else:
            await db.delete(user)
    else:
        await db.delete(user)

    await db.commit()

    response.delete_cookie("refresh_token", path="/api/auth")
    response.delete_cookie("access_token", path="/")
    response.delete_cookie("access_token", path="/api")
    log.info("delete_my_account: user=%s org=%s deleted", user.id, user.org_id)
    return {"ok": True, "detail": "Account deleted"}

@router.get("/me", response_model=UserResponse)
async def get_me(user=Depends(get_current_user)):
    """Get the currently authenticated user."""
    response = UserResponse.model_validate(user)
    response.has_password = bool(user.password_hash)
    return response

class UpdateProfileRequest(BaseModel):
    username: str = Field(min_length=3, max_length=150)

    @field_validator("username")
    @classmethod
    def username_alphanumeric(cls, v: str) -> str:
        if not v.replace("_", "").replace("-", "").isalnum():
            raise ValueError("Username must contain only letters, numbers, hyphens, and underscores")
        return v.lower()


class ForgotPasswordRequest(BaseModel):
    email: str

class VerifyEmailRequest(BaseModel):
    token: str

class ResetPasswordRequest(BaseModel):
    token: str
    new_password: str = Field(min_length=8, max_length=128)

    @field_validator("new_password")
    @classmethod
    def password_strength(cls, v: str) -> str:
        if not any(c.isupper() for c in v):
            raise ValueError("Password must contain at least one uppercase letter")
        if not any(c.islower() for c in v):
            raise ValueError("Password must contain at least one lowercase letter")
        if not any(c.isdigit() for c in v):
            raise ValueError("Password must contain at least one digit")
        return v


@router.post("/forgot-password")
@limiter.limit("3/hour")
async def forgot_password(request: Request, data: ForgotPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Request a password reset email.

    Always returns a generic success message, regardless of whether the
    email matches an account — this prevents attackers from using this
    endpoint to discover which emails have accounts (user enumeration).
    """
    import secrets as _secrets
    from datetime import timedelta as _timedelta
    from app.models import PasswordResetToken
    from app.system_mail import send_system_email

    generic_response = {"detail": "If an account with that email exists, a reset link has been sent."}

    email = data.email.strip().lower()
    result = await db.execute(select(User).where(User.email == email))
    user = result.scalar_one_or_none()
    if not user:
        return generic_response

    token = _secrets.token_urlsafe(48)
    reset = PasswordResetToken(
        user_id=user.id,
        token=token,
        expires_at=utcnow() + _timedelta(minutes=30),
    )
    db.add(reset)
    await db.flush()
    await db.commit()

    base_url = "http://localhost:8000"  # TODO: use your real production domain here
    reset_link = f"{base_url}/reset-password?token={token}"
    sent = send_system_email(
        to_email=user.email,
        subject="Reset your Emissary password",
        body=(
            f"Hi {user.username},\n\n"
            f"Someone requested a password reset for your Emissary account. "
            f"Click the link below to set a new password. This link expires in 30 minutes.\n\n"
            f"{reset_link}\n\n"
            f"If you didn't request this, you can safely ignore this email."
        ),
    )
    if not sent:
        log.error("forgot_password: failed to send reset email to %s", user.email)

    return generic_response


@router.post("/reset-password")
async def reset_password(data: ResetPasswordRequest, db: AsyncSession = Depends(get_db)):
    """Set a new password using a valid, unused, unexpired reset token."""
    from app.models import PasswordResetToken

    result = await db.execute(select(PasswordResetToken).where(PasswordResetToken.token == data.token))
    reset = result.scalar_one_or_none()

    if not reset or reset.used or reset.expires_at < utcnow():
        raise HTTPException(400, "This reset link is invalid or has expired. Please request a new one.")

    user = await db.get(User, reset.user_id)
    if not user:
        raise HTTPException(400, "This reset link is invalid.")

    user.password_hash = hash_password(data.new_password)
    reset.used = True
    await db.flush()
    log.info("reset_password: password reset for user=%s via token", user.id)
    return {"detail": "Password reset successfully. You can now sign in."}

@router.post("/verify-email")
async def verify_email(data: VerifyEmailRequest, db: AsyncSession = Depends(get_db)):
    """Confirm a new account's email address using a valid, unused, unexpired token."""
    from app.models import EmailVerificationToken

    result = await db.execute(select(EmailVerificationToken).where(EmailVerificationToken.token == data.token))
    verification = result.scalar_one_or_none()

    if not verification or verification.used or verification.expires_at < utcnow():
        raise HTTPException(400, "This verification link is invalid or has expired. Please request a new one.")

    user = await db.get(User, verification.user_id)
    if not user:
        raise HTTPException(400, "This verification link is invalid.")

    user.is_verified = True
    verification.used = True
    await db.flush()
    log.info("verify_email: email verified for user=%s via token", user.id)
    return {"detail": "Email verified successfully. You can now sign in."}

@router.get("/verify-email")
async def verify_email_link(token: str, db: AsyncSession = Depends(get_db)):
    """Handle the actual link clicked from the verification email (browser GET request)."""
    from fastapi.responses import RedirectResponse
    from app.models import EmailVerificationToken

    result = await db.execute(select(EmailVerificationToken).where(EmailVerificationToken.token == token))
    verification = result.scalar_one_or_none()

    if not verification or verification.used or verification.expires_at < utcnow():
        return RedirectResponse(url="/login?verified=expired")

    user = await db.get(User, verification.user_id)
    if not user:
        return RedirectResponse(url="/login?verified=invalid")

    user.is_verified = True
    verification.used = True
    await db.flush()
    log.info("verify_email_link: email verified for user=%s via link", user.id)
    return RedirectResponse(url="/login?verified=success")
    
@router.patch("/me", response_model=UserResponse)
async def update_my_profile(
    data: UpdateProfileRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Update the current user's username."""
    existing = await db.execute(
        select(User).where(User.username == data.username, User.id != user.id)
    )
    if existing.scalar_one_or_none():
        raise HTTPException(409, "Username already taken")
    user.username = data.username
    await db.flush()
    return user

@router.put("/change-password")
async def change_password(
    data: ChangePasswordRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Change the current user's password.

    If the account has no password yet (created via Google/Microsoft
    sign-in), this sets one for the first time — current_password can be
    left blank in that case.
    """
    if user.password_hash:
        if not verify_password(data.current_password, user.password_hash):
            raise HTTPException(status_code=400, detail="Current password is incorrect")
    user.password_hash = hash_password(data.new_password)
    await db.flush()
    return {"detail": "Password set" if not user.password_hash else "Password changed"}

# ---------------------------------------------------------------------------
# User management (admin only)
# ---------------------------------------------------------------------------


@router.post("/users", response_model=UserResponse, status_code=201)
async def create_user(
    data: RegisterRequest,
    admin=Depends(require_admin),
    db: AsyncSession = Depends(get_db),
):
    """Admin creates a new user."""
    existing = await db.execute(
        select(User).where((User.username == data.username) | (User.email == data.email))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Username or email already taken")

    user = User(
        username=data.username,
        email=data.email,
        password_hash=hash_password(data.password),
        role="user",
        is_active=True,
    )
    db.add(user)
    await db.flush()
    return user


@router.get("/users", response_model=list[UserResponse])
async def list_users(admin=Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """List all users (admin only)."""
    result = await db.execute(select(User).where(User.org_id == admin.org_id).order_by(User.id))
    return result.scalars().all()


class InviteUserRequest(BaseModel):
    email: str = Field(min_length=5, max_length=255)
    role: str = "user"

    @field_validator("role")
    @classmethod
    def validate_role(cls, v):
        if v not in ("admin", "user", "read_only"):
            raise ValueError("Role must be admin, user, or read_only")
        return v


@router.post("/users/invite")
async def invite_user(data: InviteUserRequest, admin=Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """Admin invites a new team member by email. They set their own username/password via the link."""
    import secrets as _secrets
    from datetime import timedelta as _timedelta
    from app.models import UserInvitation
    from app.system_mail import send_system_email

    existing = await db.execute(select(User).where(User.email == data.email))
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="A user with that email already exists")

    token = _secrets.token_urlsafe(48)
    invitation = UserInvitation(
        org_id=admin.org_id,
        email=data.email,
        role=data.role,
        token=token,
        invited_by_user_id=admin.id,
        expires_at=utcnow() + _timedelta(days=7),
    )
    db.add(invitation)
    await db.flush()
    await db.commit()

    base_url = "http://localhost:8000"  # TODO: use your real production domain here
    invite_link = f"{base_url}/accept-invite?token={token}"
    sent = send_system_email(
        to_email=data.email,
        subject="You've been invited to join Emissary",
        body=(
            f"Hi,\n\n"
            f"{admin.username} has invited you to join their Emissary organization as a '{data.role}' user. "
            f"Click the link below to set up your account. This link expires in 7 days.\n\n"
            f"{invite_link}\n\n"
        ),
    )
    if not sent:
        log.error("invite_user: failed to send invite email to %s", data.email)

    try:
        from app.audit import audit
        await audit(db, None, admin, "team.invite",
                    target_type="user", target_id=data.email,
                    detail={"email": data.email, "role": data.role})
        await db.commit()
    except Exception:
        pass
    return {"detail": f"Invitation sent to {data.email}."}


@router.get("/invite-info")
async def invite_info(token: str, db: AsyncSession = Depends(get_db)):
    """Public: look up basic info about an invitation for the accept-invite page."""
    from app.models import UserInvitation, Organization

    result = await db.execute(select(UserInvitation).where(UserInvitation.token == token))
    invitation = result.scalar_one_or_none()

    if not invitation or invitation.used or invitation.expires_at < utcnow():
        raise HTTPException(400, "This invitation link is invalid or has expired.")

    org = await db.get(Organization, invitation.org_id)
    return {
        "email": invitation.email,
        "role": invitation.role,
        "organization_name": org.name if org else "",
    }


class AcceptInviteRequest(BaseModel):
    token: str
    username: str = Field(min_length=3, max_length=150)
    password: str = Field(min_length=8, max_length=128)

    @field_validator("username")
    @classmethod
    def username_alphanumeric(cls, v: str) -> str:
        if not v.replace("_", "").replace("-", "").isalnum():
            raise ValueError("Username must contain only letters, numbers, hyphens, and underscores")
        return v.lower()


@router.post("/accept-invite", response_model=UserResponse, status_code=201)
async def accept_invite(data: AcceptInviteRequest, db: AsyncSession = Depends(get_db)):
    """Public: a new team member sets their username/password to complete the invite."""
    from app.models import UserInvitation

    result = await db.execute(select(UserInvitation).where(UserInvitation.token == data.token))
    invitation = result.scalar_one_or_none()

    if not invitation or invitation.used or invitation.expires_at < utcnow():
        raise HTTPException(400, "This invitation link is invalid or has expired.")

    existing = await db.execute(
        select(User).where((User.username == data.username) | (User.email == invitation.email))
    )
    if existing.scalar_one_or_none():
        raise HTTPException(status_code=409, detail="Username or email already taken")

    user = User(
        org_id=invitation.org_id,
        username=data.username,
        email=invitation.email,
        password_hash=hash_password(data.password),
        role=invitation.role,
        is_active=True,
        is_verified=True,
    )
    db.add(user)
    await db.flush()

    invitation.used = True
    await db.flush()

    log.info("accept_invite: user=%s created via invite for org=%s role=%s", user.username, user.org_id, user.role)
    return user


class UpdateUserRequest(BaseModel):
    role: str | None = None
    is_active: bool | None = None

    @field_validator("role")
    @classmethod
    def validate_role(cls, v):
        if v is not None and v not in ("admin", "user", "read_only"):
            raise ValueError("Role must be admin, user, or read_only")
        return v


@router.patch("/users/{user_id}", response_model=UserResponse)
async def update_user(user_id: int, data: UpdateUserRequest, admin=Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """Admin changes a team member's role and/or revokes/restores their access.
    Scoped to the admin's own organization; cannot be used to modify yourself."""
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Use your profile settings to change your own account")

    target = await db.get(User, user_id)
    if not target or target.org_id != admin.org_id:
        raise HTTPException(status_code=404, detail="User not found")

    if target.is_owner:
        raise HTTPException(status_code=403, detail="The organization owner's account cannot be modified by other admins")

    if data.role is not None:
        if data.role == "admin" and not admin.is_owner:
            raise HTTPException(status_code=403, detail="Only the organization owner can grant admin access")
        target.role = data.role
    if data.is_active is not None:
        target.is_active = data.is_active

    await db.flush()
    log.info("update_user: admin=%s updated user=%s (role=%s, is_active=%s)", admin.id, target.id, target.role, target.is_active)
    return target


@router.delete("/users/{user_id}")
async def delete_user(user_id: int, admin=Depends(require_admin), db: AsyncSession = Depends(get_db)):
    """Admin permanently deletes a team member's account.
    Scoped to the admin's own organization; cannot be used to delete yourself."""
    if user_id == admin.id:
        raise HTTPException(status_code=400, detail="Use account deletion in your profile settings to delete your own account")

    target = await db.get(User, user_id)
    if not target or target.org_id != admin.org_id:
        raise HTTPException(status_code=404, detail="User not found")

    if target.is_owner:
        raise HTTPException(status_code=403, detail="The organization owner's account cannot be deleted by other admins")

    await db.delete(target)
    await db.flush()
    log.info("delete_user: admin=%s deleted user=%s", admin.id, user_id)
    return {"detail": "User deleted."}


# ---------------------------------------------------------------------------
# API Key management
# ---------------------------------------------------------------------------


@router.post("/api-keys")
async def create_api_key(
    data: CreateAPIKeyRequest,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Create a new API key. The raw key is returned ONLY once."""
    raw_key = f"qk_{secrets.token_urlsafe(48)}"
    prefix = raw_key[:12]

    expires_at = None
    if data.expires_in_days:
        expires_at = utcnow() + timedelta(days=data.expires_in_days)

    api_key = APIKey(
        user_id=user.id,
        name=data.name,
        key_hash=hash_api_key(raw_key),
        prefix=prefix,
        scopes=data.scopes,
        expires_at=expires_at,
    )
    db.add(api_key)
    await db.flush()

    return {
        "id": api_key.id,
        "name": api_key.name,
        "key": raw_key,  # ONLY returned on creation
        "prefix": prefix,
        "scopes": data.scopes,
        "expires_at": expires_at.isoformat() if expires_at else None,
        "message": "Save this key now — it cannot be retrieved again.",
    }


@router.get("/api-keys", response_model=list[APIKeyResponse])
async def list_api_keys(user=Depends(get_current_user), db: AsyncSession = Depends(get_db)):
    """List all API keys for the current user (hashes are never exposed)."""
    result = await db.execute(
        select(APIKey)
        .where(APIKey.user_id == user.id, APIKey.revoked == False)
        .order_by(APIKey.created_at.desc())
    )
    return result.scalars().all()


@router.delete("/api-keys/{key_id}")
async def revoke_api_key(
    key_id: int,
    user=Depends(get_current_user),
    db: AsyncSession = Depends(get_db),
):
    """Revoke an API key (soft delete)."""
    api_key = await db.get(APIKey, key_id)
    if not api_key or api_key.user_id != user.id:
        raise HTTPException(status_code=404, detail="API key not found")
    api_key.revoked = True
    await db.flush()
    return {"detail": "API key revoked"}
