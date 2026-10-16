"""Visual branch-tree sequence builder: nodes + edges API.

Phase C of the branching-sequence feature. This is additive — it does not
touch the existing flat Sequence model or affect any currently-running
campaign. Scheduling/sending logic for trees is built in a later phase.
"""
from __future__ import annotations

import logging

from fastapi import APIRouter, Depends, HTTPException
from pydantic import BaseModel
from sqlalchemy import select, delete
from sqlalchemy.ext.asyncio import AsyncSession

from app.database import get_db
from app.auth import get_current_org_id
from app.models import Campaign, SequenceNode, SequenceEdge, SequenceVariant

log = logging.getLogger("quickly.sequence_tree")

router = APIRouter(prefix="/api/campaigns/{campaign_id}/tree", tags=["sequence-tree"])

VALID_CONDITIONS = {"always", "opened", "not_opened", "opened_no_reply", "clicked", "not_clicked", "replied"}


async def _block_tree_edit_unless_manual(campaign) -> None:
    mode = getattr(campaign, "campaign_mode", "manual") or "manual"
    if mode != "manual":
        raise HTTPException(400, "Branch tree is only available in Manual mode")


async def _get_campaign_or_404(campaign_id: int, db: AsyncSession, org_id: int | None) -> Campaign:
    result = await db.execute(select(Campaign).where(Campaign.id == campaign_id, Campaign.org_id == org_id))
    campaign = result.scalar_one_or_none()
    if not campaign:
        raise HTTPException(404, "Campaign not found")
    return campaign


class NodeCreate(BaseModel):
    is_root: bool = False
    label: str | None = None
    subject: str | None = None
    body: str = ""
    is_html: bool | None = None
    preview_text: str | None = None
    canvas_x: int | None = None
    canvas_y: int | None = None
    custom_id: str | None = None


class NodeUpdate(BaseModel):
    is_root: bool | None = None
    label: str | None = None
    subject: str | None = None
    body: str | None = None
    is_html: bool | None = None
    preview_text: str | None = None
    canvas_x: int | None = None
    canvas_y: int | None = None
    custom_id: str | None = None


class EdgeCreate(BaseModel):
    from_node_id: int
    to_node_id: int
    condition_type: str = "always"
    wait_days: int = 0
    wait_minutes: int = 0
    no_reply_minutes: int | None = None


@router.get("")
async def get_tree(campaign_id: int, db: AsyncSession = Depends(get_db), org_id: int | None = Depends(get_current_org_id)):
    """Return every node and edge for this campaign's sequence tree."""
    await _get_campaign_or_404(campaign_id, db, org_id)
    nodes = (await db.execute(select(SequenceNode).where(SequenceNode.campaign_id == campaign_id))).scalars().all()
    edges = (await db.execute(select(SequenceEdge).where(SequenceEdge.campaign_id == campaign_id))).scalars().all()
    node_ids = [n.id for n in nodes]
    variants_all = []
    if node_ids:
        variants_all = (await db.execute(
            select(SequenceVariant).where(SequenceVariant.node_id.in_(node_ids))
        )).scalars().all()
    variants_by_node: dict = {}
    for v in variants_all:
        variants_by_node.setdefault(v.node_id, []).append(v)
    return {
        "nodes": [
            {
                "id": n.id, "is_root": n.is_root, "label": n.label,
                "subject": n.subject, "body": n.body, "is_html": n.is_html,
                "preview_text": n.preview_text, "canvas_x": n.canvas_x, "canvas_y": n.canvas_y,
                "custom_id": n.custom_id,
                "variants": [
                    {
                        "id": v.id, "label": v.label, "subject": v.subject,
                        "body": v.body, "is_html": v.is_html,
                        "preview_text": v.preview_text, "enabled": v.enabled,
                    }
                    for v in variants_by_node.get(n.id, [])
                ],
            }
            for n in nodes
        ],
        "edges": [
            {
                "id": e.id, "from_node_id": e.from_node_id, "to_node_id": e.to_node_id,
                "condition_type": e.condition_type, "wait_days": e.wait_days,
                "wait_minutes": e.wait_minutes,
                "no_reply_minutes": e.no_reply_minutes,
            }
            for e in edges
        ],
    }


@router.post("/nodes")
async def create_node(campaign_id: int, data: NodeCreate, db: AsyncSession = Depends(get_db), org_id: int | None = Depends(get_current_org_id)):
    _camp = await _get_campaign_or_404(campaign_id, db, org_id)
    await _block_tree_edit_unless_manual(_camp)
    node = SequenceNode(
        campaign_id=campaign_id,
        is_root=data.is_root,
        label=data.label,
        subject=data.subject,
        body=data.body,
        is_html=data.is_html,
        preview_text=data.preview_text,
        canvas_x=data.canvas_x,
        canvas_y=data.canvas_y,
        custom_id=data.custom_id,
    )
    db.add(node)
    await db.flush()
    await db.refresh(node)
    log.info("create_node: campaign=%s node=%s is_root=%s", campaign_id, node.id, node.is_root)
    return {"id": node.id}


@router.patch("/nodes/{node_id}")
async def update_node(campaign_id: int, node_id: int, data: NodeUpdate, db: AsyncSession = Depends(get_db), org_id: int | None = Depends(get_current_org_id)):
    await _get_campaign_or_404(campaign_id, db, org_id)
    result = await db.execute(select(SequenceNode).where(SequenceNode.id == node_id, SequenceNode.campaign_id == campaign_id))
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(404, "Node not found")
    for field in ("is_root", "label", "subject", "body", "is_html", "preview_text", "canvas_x", "canvas_y", "custom_id"):
        value = getattr(data, field)
        if value is not None:
            setattr(node, field, value)
    await db.flush()
    return {"ok": True}


@router.delete("/nodes/{node_id}")
async def delete_node(campaign_id: int, node_id: int, db: AsyncSession = Depends(get_db), org_id: int | None = Depends(get_current_org_id)):
    await _get_campaign_or_404(campaign_id, db, org_id)
    result = await db.execute(select(SequenceNode).where(SequenceNode.id == node_id, SequenceNode.campaign_id == campaign_id))
    node = result.scalar_one_or_none()
    if not node:
        raise HTTPException(404, "Node not found")
    # Also remove any edges touching this node so the tree stays consistent.
    await db.execute(delete(SequenceEdge).where(
        (SequenceEdge.from_node_id == node_id) | (SequenceEdge.to_node_id == node_id)
    ))
    await db.delete(node)
    await db.flush()
    return {"ok": True}

class EdgeUpdate(BaseModel):
    condition_type: str | None = None
    wait_days: int | None = None
    wait_minutes: int | None = None
    no_reply_minutes: int | None = None


@router.patch("/edges/{edge_id}")
async def update_edge(campaign_id: int, edge_id: int, data: EdgeUpdate, db: AsyncSession = Depends(get_db), org_id: int | None = Depends(get_current_org_id)):
    await _get_campaign_or_404(campaign_id, db, org_id)
    result = await db.execute(select(SequenceEdge).where(SequenceEdge.id == edge_id, SequenceEdge.campaign_id == campaign_id))
    edge = result.scalar_one_or_none()
    if not edge:
        raise HTTPException(404, "Edge not found")
    if data.condition_type is not None:
        if data.condition_type not in VALID_CONDITIONS:
            raise HTTPException(400, f"condition_type must be one of: {', '.join(sorted(VALID_CONDITIONS))}")
        edge.condition_type = data.condition_type
    if data.wait_days is not None:
        edge.wait_days = data.wait_days
    if data.wait_minutes is not None:
        edge.wait_minutes = data.wait_minutes
    if data.no_reply_minutes is not None:
        edge.no_reply_minutes = data.no_reply_minutes
    await db.flush()
    return {"ok": True}

@router.post("/edges")
async def create_edge(campaign_id: int, data: EdgeCreate, db: AsyncSession = Depends(get_db), org_id: int | None = Depends(get_current_org_id)):
    _camp = await _get_campaign_or_404(campaign_id, db, org_id)
    await _block_tree_edit_unless_manual(_camp)
    if data.condition_type not in VALID_CONDITIONS:
        raise HTTPException(400, f"condition_type must be one of: {', '.join(sorted(VALID_CONDITIONS))}")
    if data.from_node_id == data.to_node_id:
        raise HTTPException(400, "A node cannot connect to itself")

    nodes_check = await db.execute(
        select(SequenceNode.id).where(
            SequenceNode.campaign_id == campaign_id,
            SequenceNode.id.in_([data.from_node_id, data.to_node_id]),
        )
    )
    found_ids = {r[0] for r in nodes_check.all()}
    if data.from_node_id not in found_ids or data.to_node_id not in found_ids:
        raise HTTPException(404, "One or both nodes not found in this campaign")

    edge = SequenceEdge(
        campaign_id=campaign_id,
        from_node_id=data.from_node_id,
        to_node_id=data.to_node_id,
        condition_type=data.condition_type,
        wait_days=data.wait_days,
        wait_minutes=data.wait_minutes,
        no_reply_minutes=data.no_reply_minutes,
    )
    db.add(edge)
    await db.flush()
    await db.refresh(edge)
    log.info("create_edge: campaign=%s edge=%s %s->%s (%s)", campaign_id, edge.id, data.from_node_id, data.to_node_id, data.condition_type)
    return {"id": edge.id}


@router.delete("/edges/{edge_id}")
async def delete_edge(campaign_id: int, edge_id: int, db: AsyncSession = Depends(get_db), org_id: int | None = Depends(get_current_org_id)):
    await _get_campaign_or_404(campaign_id, db, org_id)
    result = await db.execute(select(SequenceEdge).where(SequenceEdge.id == edge_id, SequenceEdge.campaign_id == campaign_id))
    edge = result.scalar_one_or_none()
    if not edge:
        raise HTTPException(404, "Edge not found")
    await db.delete(edge)
    await db.flush()
    return {"ok": True}



# ── Node variant CRUD ─────────────────────────────────────────────────────────

class NodeVariantCreate(BaseModel):
    label: str = ""
    subject: str | None = None
    body: str = ""
    is_html: bool | None = None
    preview_text: str | None = None


class NodeVariantUpdate(BaseModel):
    label: str | None = None
    subject: str | None = None
    body: str | None = None
    is_html: bool | None = None
    preview_text: str | None = None
    enabled: bool | None = None


@router.get("/nodes/{node_id}/variants")
async def list_node_variants(campaign_id: int, node_id: int, db: AsyncSession = Depends(get_db), org_id: int | None = Depends(get_current_org_id)):
    await _get_campaign_or_404(campaign_id, db, org_id)
    variants = (await db.execute(select(SequenceVariant).where(SequenceVariant.node_id == node_id))).scalars().all()
    return [{"id": v.id, "label": v.label, "subject": v.subject, "body": v.body,
             "is_html": v.is_html, "preview_text": v.preview_text, "enabled": v.enabled} for v in variants]


@router.post("/nodes/{node_id}/variants")
async def create_node_variant(campaign_id: int, node_id: int, data: NodeVariantCreate, db: AsyncSession = Depends(get_db), org_id: int | None = Depends(get_current_org_id)):
    await _get_campaign_or_404(campaign_id, db, org_id)
    v = SequenceVariant(
        node_id=node_id, sequence_id=None,
        label=data.label, subject=data.subject, body=data.body,
        is_html=data.is_html, preview_text=data.preview_text,
    )
    db.add(v)
    await db.flush()
    await db.refresh(v)
    return {"id": v.id}


@router.patch("/nodes/{node_id}/variants/{variant_id}")
async def update_node_variant(campaign_id: int, node_id: int, variant_id: int, data: NodeVariantUpdate, db: AsyncSession = Depends(get_db), org_id: int | None = Depends(get_current_org_id)):
    await _get_campaign_or_404(campaign_id, db, org_id)
    result = await db.execute(select(SequenceVariant).where(SequenceVariant.id == variant_id, SequenceVariant.node_id == node_id))
    v = result.scalar_one_or_none()
    if not v:
        raise HTTPException(404, "Variant not found")
    for field in ("label", "subject", "body", "is_html", "preview_text", "enabled"):
        val = getattr(data, field)
        if val is not None:
            setattr(v, field, val)
    await db.flush()
    return {"ok": True}


@router.delete("/nodes/{node_id}/variants/{variant_id}")
async def delete_node_variant(campaign_id: int, node_id: int, variant_id: int, db: AsyncSession = Depends(get_db), org_id: int | None = Depends(get_current_org_id)):
    await _get_campaign_or_404(campaign_id, db, org_id)
    result = await db.execute(select(SequenceVariant).where(SequenceVariant.id == variant_id, SequenceVariant.node_id == node_id))
    v = result.scalar_one_or_none()
    if not v:
        raise HTTPException(404, "Variant not found")
    await db.delete(v)
    await db.flush()
    return {"ok": True}

