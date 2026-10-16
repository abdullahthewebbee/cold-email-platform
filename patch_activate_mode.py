path = r"D:\projects\quickly\app\routers\settings.py"

with open(path, encoding='utf-8') as f:
    content = f.read()

addition = '''

# ---------------------------------------------------------------------------
# POST /api/settings/activate-mode
# ---------------------------------------------------------------------------
MODE_FEATURES = {
    "manual":      [],
    "semi_manual": ["reply_classifier", "reply_draft"],
    "full_ai":     ["reply_classifier", "reply_draft", "deep_personalization", "sequence_generator"],
}

@router.post("/activate-mode")
async def activate_campaign_mode(
    data: dict,
    db: AsyncSession = Depends(get_db),
):
    """Enable or disable all AI features associated with a campaign mode.
    
    When a mode is activated, all its required AI features are enabled.
    When deactivated, those features are disabled (unless shared with another active mode).
    """
    mode = data.get("mode")
    active = bool(data.get("active", True))
    
    if mode not in MODE_FEATURES:
        raise HTTPException(400, f"Unknown mode: {mode}. Choose from: {list(MODE_FEATURES.keys())}")
    
    from app.settings_manager import save_setting_to_db
    
    features_to_toggle = MODE_FEATURES[mode]
    
    for feature_id in features_to_toggle:
        prefix = f"ai_{feature_id}_"
        await save_setting_to_db(db, f"{prefix}enabled", "true" if active else "false")
    
    await db.commit()
    
    return {
        "ok": True,
        "mode": mode,
        "active": active,
        "features_updated": features_to_toggle,
    }
'''

if '/activate-mode' in content:
    print("Already exists")
else:
    with open(path, 'w', encoding='utf-8') as f:
        f.write(content + addition)
    print("OK — activate-mode endpoint added")