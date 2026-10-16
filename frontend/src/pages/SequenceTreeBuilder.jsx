import { useState, useEffect, useCallback } from 'react';
import ReactFlow, {
  Background, Controls, MiniMap, applyNodeChanges, applyEdgeChanges,
  MarkerType, Handle, Position, useReactFlow, ReactFlowProvider,
} from 'reactflow';
import 'reactflow/dist/style.css';
import { api } from '../api';
import { Button } from '../components/ui/Button';
import { useNotify } from '../context/NotificationContext';
import Icon from '../components/ui/AegisIcon';

/* ── Condition config ───────────────────────────────────────────────── */
const CONDITIONS = {
  always:          { label: 'Always',            color: 'var(--text-muted)', bg: 'var(--bg-elevated)', text: 'var(--text)' },
  opened:          { label: 'If Opened',         color: 'var(--success)', bg: 'var(--success-dim)', text: 'var(--success)' },
  not_opened:      { label: 'If NOT Opened',     color: 'var(--warning)', bg: 'var(--warning-dim)', text: 'var(--warning)' },
  opened_no_reply: { label: 'Opened · No Reply', color: 'var(--gold)', bg: 'var(--gold-dim)', text: 'var(--gold)' },
  clicked:         { label: 'If Clicked',        color: 'var(--info)', bg: 'var(--info-dim)', text: 'var(--info)' },
  not_clicked:     { label: 'If NOT Clicked',    color: 'var(--warning)', bg: 'var(--warning-dim)', text: 'var(--warning)' },
  replied:         { label: 'If Replied',        color: 'var(--info)', bg: 'var(--info-dim)', text: 'var(--info)' },
};

/* ── Node card ──────────────────────────────────────────────────────── */
function TreeNodeBox({ data, selected }) {
  const isRoot = data.isRoot;
  const hasVariants = data.variant_count > 0;

  return (
    <div style={{
      borderRadius: 14,
      background: isRoot ? 'linear-gradient(135deg, var(--gold-dark) 0%, var(--gold) 100%)' : 'var(--bg-elevated)',
      border: selected ? '2px solid var(--gold)' : `2px solid ${isRoot ? 'var(--gold)' : 'var(--border-active)'}`,
      minWidth: 210, maxWidth: 250,
      boxShadow: selected
        ? '0 0 0 3px var(--gold-dim), 0 8px 24px rgba(0,0,0,0.4)'
        : '0 4px 16px rgba(0,0,0,0.3)',
      transition: 'all 0.15s ease',
      cursor: 'pointer',
    }}>
      <Handle type="target" position={Position.Left}
        style={{ background: 'var(--gold)', width: 12, height: 12, left: -7, border: '2px solid var(--border)' }} />

      {/* Header */}
      <div style={{ padding: '10px 12px 8px', borderBottom: `1px solid ${isRoot ? 'rgba(0,0,0,0.15)' : 'var(--border-active)'}` }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 4 }}>
          {isRoot && (
            <span style={{
              fontSize: 8, fontWeight: 900, color: 'var(--gold)', background: 'var(--on-gold)',
              borderRadius: 4, padding: '2px 6px', letterSpacing: 1.5, flexShrink: 0,
            }}>START</span>
          )}
          <span style={{
            fontSize: 13, fontWeight: 700,
            color: isRoot ? 'var(--on-gold)' : 'var(--text)',
            flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
          }}>
            {data.label || 'Untitled Step'}
          </span>
          {data.custom_id && (
            <span style={{
              fontSize: 9, fontWeight: 800, color: 'var(--gold)', background: 'var(--gold-dim)',
              border: '1px solid var(--gold-dim)', borderRadius: 5,
              padding: '2px 7px', flexShrink: 0, fontFamily: 'monospace', letterSpacing: 0.5,
            }}>
              {data.custom_id}
            </span>
          )}
        </div>
      </div>

      {/* Body */}
      <div style={{ padding: '8px 12px 10px' }}>
        {data.subject ? (
          <div style={{ fontSize: 11, color: isRoot ? 'var(--on-gold)' : 'var(--text-muted)',
                        fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <Icon name="mail" size={12} style={{ verticalAlign: '-2px', marginRight: 4 }} />{data.subject}
          </div>
        ) : (
          <div style={{ fontSize: 11, color: isRoot ? 'var(--on-gold)' : 'var(--text-dim)', fontStyle: 'italic' }}>
            Replies in thread
          </div>
        )}
        <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', marginTop: 7 }}>
          {isRoot && (
            <span style={{ fontSize: 9, background: 'rgba(0,0,0,0.15)', color: isRoot ? 'var(--on-gold)' : 'var(--text-muted)',
                           borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>Day 1</span>
          )}
          {data.is_html && (
            <span style={{ fontSize: 9, background: 'var(--info-dim)', color: 'var(--info)',
                           borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>HTML</span>
          )}
          {hasVariants && (
            <span style={{ fontSize: 9, background: 'var(--gold-dim)', color: 'var(--gold)',
                           borderRadius: 4, padding: '2px 6px', fontWeight: 700 }}>
              A/B ×{data.variant_count}
            </span>
          )}
        </div>
      </div>

      <Handle type="source" position={Position.Right}
        style={{ background: 'var(--gold)', width: 12, height: 12, right: -7, border: '2px solid var(--border)' }} />
    </div>
  );
}

const nodeTypes = { treeNode: TreeNodeBox };

/* ── Fit view button ────────────────────────────────────────────────── */
function FitViewButton() {
  const { fitView } = useReactFlow();
  return (
    <button onClick={() => fitView({ padding: 0.2, duration: 400 })}
      style={{
        position: 'absolute', top: 52, left: 12, zIndex: 10,
        background: 'var(--bg-elevated)', border: '1px solid var(--border-active)', borderRadius: 8,
        padding: '5px 10px', fontSize: 11, fontWeight: 600, color: 'var(--text-muted)',
        cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4,
      }}>
      ⤢ Fit
    </button>
  );
}

/* ── Custom ID editor in side panel ────────────────────────────────── */
function CustomIdEditor({ nodeId, initialValue, campaignId, onSaved }) {
  const notify = useNotify();
  const [value, setValue] = useState(initialValue);
  const [saving, setSaving] = useState(false);
  const save = async () => {
    setSaving(true);
    try {
      const trimmed = value.trim().toUpperCase() || null;
      await api.patch(`/campaigns/${campaignId}/tree/nodes/${nodeId}`, { custom_id: trimmed });
      onSaved(trimmed);
      notify({ type: 'success', message: 'Custom ID saved' });
    } catch (err) { notify({ type: 'error', message: err.message }); }
    finally { setSaving(false); }
  };
  return (
    <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
      <input
        style={{
          flex: 1, background: 'var(--bg)', border: '1px solid var(--border-active)', borderRadius: 8,
          padding: '6px 10px', fontSize: 12, fontFamily: 'monospace', color: 'var(--gold)',
          outline: 'none', textTransform: 'uppercase', letterSpacing: 1,
        }}
        placeholder="e.g. INIT"
        maxLength={32}
        value={value || ''}
        onChange={e => setValue(e.target.value.toUpperCase())}
        onKeyDown={e => { if (e.key === 'Enter') save(); }}
      />
      <button onClick={save} disabled={saving} style={{
        background: saving ? 'var(--bg-input)' : 'var(--gold)', color: saving ? 'var(--text-muted)' : 'var(--on-gold)', border: 'none',
        borderRadius: 7, padding: '6px 12px', fontSize: 11, fontWeight: 700, cursor: 'pointer',
      }}>
        {saving ? '…' : 'Set'}
      </button>
    </div>
  );
}

/* ── Inner component ────────────────────────────────────────────────── */
function TreeBuilderInner({ campaignId, onGoToSequences }) {
  const notify = useNotify();
  const [nodes, setNodes]               = useState([]);
  const [edges, setEdges]               = useState([]);
  const [selectedNode, setSelectedNode] = useState(null);
  const [loading, setLoading]           = useState(true);
  const [pendingEdge, setPendingEdge]   = useState(null);
  const [editingEdge, setEditingEdge]   = useState(null);
  const [showGuide, setShowGuide]       = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const data = await api.get(`/campaigns/${campaignId}/tree`);
      setNodes(data.nodes.map((n, idx) => ({
        id: String(n.id),
        type: 'treeNode',
        position: { x: n.canvas_x ?? 120 + idx * 280, y: n.canvas_y ?? 200 },
        data: {
          label: n.label, subject: n.subject, is_html: n.is_html,
          isRoot: n.is_root, custom_id: n.custom_id,
          variant_count: n.variants?.length ?? 0,
          raw: n,
        },
      })));
      setEdges(data.edges.map(e => {
        const c = CONDITIONS[e.condition_type] || CONDITIONS.always;
        const noReplyLabel = e.no_reply_minutes
          ? (e.no_reply_minutes >= 60 ? ` (${Math.round(e.no_reply_minutes/60)}h)` : ` (${e.no_reply_minutes}m)`)
          : '';
        return {
          id: `e${e.id}`,
          source: String(e.from_node_id),
          target: String(e.to_node_id),
          type: 'smoothstep',
          label: `${c.label}${noReplyLabel}${e.wait_days ? ` � ${e.wait_days}d` : (e.wait_minutes ? ` � ${e.wait_minutes}m` : ``)}`,
          markerEnd: { type: MarkerType.ArrowClosed, color: c.color, width: 18, height: 18 },
          style: { stroke: c.color, strokeWidth: 2.5 },
          labelStyle: { fill: c.text || 'var(--text)', fontWeight: 700, fontSize: 10 },
          labelBgStyle: { fill: c.bg, fillOpacity: 1 },
          labelBgPadding: [7, 4],
          labelBgBorderRadius: 6,
          data: { raw: e },
        };
      }));
    } catch (err) { notify({ type: 'error', message: err.message }); }
    finally { setLoading(false); }
  }, [campaignId]);

  useEffect(() => { load(); }, [load]);

  const onNodesChange = useCallback(c => setNodes(n => applyNodeChanges(c, n)), []);
  const onEdgesChange = useCallback(c => setEdges(e => applyEdgeChanges(c, e)), []);

  const onNodeDragStop = async (_e, node) => {
    try {
      await api.patch(`/campaigns/${campaignId}/tree/nodes/${node.id}`, {
        canvas_x: Math.round(node.position.x), canvas_y: Math.round(node.position.y),
      });
    } catch { notify({ type: 'error', message: 'Position save failed' }); }
  };

  const onConnect = p => setPendingEdge({ source: p.source, target: p.target });

  const confirmEdge = async (conditionType, waitDays, waitMinutes, noReplyMinutes) => {
    if (!pendingEdge) return;
    try {
      await api.post(`/campaigns/${campaignId}/tree/edges`, {
        from_node_id: Number(pendingEdge.source), to_node_id: Number(pendingEdge.target),
        condition_type: conditionType, wait_days: waitDays, wait_minutes: waitMinutes, no_reply_minutes: noReplyMinutes,
      });
      notify({ type: 'success', message: 'Connection added' });
      setPendingEdge(null); load();
    } catch (err) { notify({ type: 'error', message: err.message }); }
  };

  const saveEditedEdge = async (conditionType, waitDays, waitMinutes, noReplyMinutes) => {
    if (!editingEdge) return;
    try {
      await api.patch(`/campaigns/${campaignId}/tree/edges/${editingEdge.id}`, {
        condition_type: conditionType, wait_days: waitDays, wait_minutes: waitMinutes, no_reply_minutes: noReplyMinutes,
      });
      notify({ type: 'success', message: 'Connection updated' });
      setEditingEdge(null); load();
    } catch (err) { notify({ type: 'error', message: err.message }); }
  };

  const addNode = async () => {
    try {
      const isFirst = nodes.length === 0;
      await api.post(`/campaigns/${campaignId}/tree/nodes`, {
        is_root: isFirst, label: `Step ${nodes.length + 1}`,
        subject: '', body: '',
        canvas_x: 120 + (nodes.length % 4) * 280,
        canvas_y: 120 + Math.floor(nodes.length / 4) * 220,
      });
      notify({ type: 'success', message: 'Step added — set content in Sequences tab' });
      await load();
    } catch (err) { notify({ type: 'error', message: err.message }); }
  };

  const onNodeClick = (_e, node) => { setSelectedNode(node.data); };

  const deleteNode = async (id) => {
    if (!window.confirm('Delete this step? Its connections will also be removed.')) return;
    try {
      await api.del(`/campaigns/${campaignId}/tree/nodes/${id}`);
      setSelectedNode(null); load();
    } catch (err) { notify({ type: 'error', message: err.message }); }
  };

  const deleteEdge = async id => {
    try { await api.del(`/campaigns/${campaignId}/tree/edges/${id}`); load(); }
    catch (err) { notify({ type: 'error', message: err.message }); }
  };

  if (loading) return (
    <div style={{ display:'flex', alignItems:'center', justifyContent:'center', height:300,
                  background:'var(--bg)', borderRadius:16, color:'var(--text-dim)', fontSize:14 }}>
      <span style={{ animation:'pulse 1.5s infinite' }}>Loading sequence tree…</span>
    </div>
  );

  return (
    <div style={{
      display: 'flex', borderRadius: 16, overflow: 'hidden',
      border: '1px solid var(--border-active)', height: 'calc(100vh - 200px)', minHeight: 540,
    }}>
      {/* Canvas */}
      <div style={{ flex: 1, position: 'relative', background: 'var(--bg)' }}>

        {/* Toolbar */}
        <div style={{ position:'absolute', top:12, left:12, zIndex:10, display:'flex', gap:8 }}>
          <button onClick={addNode} style={{
            background: 'linear-gradient(135deg, var(--gold-dark), var(--gold))', color: 'var(--on-gold)',
            border: 'none', borderRadius: 10, padding: '8px 16px', fontSize: 13,
            fontWeight: 700, cursor: 'pointer', boxShadow: '0 2px 8px rgba(13,148,136,0.4)',
            display: 'flex', alignItems: 'center', gap: 6,
          }}>
            <span style={{ fontSize: 16, lineHeight: 1 }}>+</span> Add Step
          </button>
          <button onClick={() => setShowGuide(g => !g)} style={{
            background: showGuide ? 'var(--info-dim)' : 'var(--bg-elevated)',
            border: `1px solid ${showGuide ? 'var(--info)' : 'var(--border-active)'}`,
            color: showGuide ? 'var(--info)' : 'var(--text-muted)',
            borderRadius: 10, padding: '8px 12px', fontSize: 12, fontWeight: 600,
            cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 5,
          }}>
            ? Guide
          </button>
        </div>

        <ReactFlow
          nodes={nodes} edges={edges}
          onNodesChange={onNodesChange} onEdgesChange={onEdgesChange}
          onNodeDragStop={onNodeDragStop} onConnect={onConnect}
          onNodeClick={onNodeClick}
          onEdgeClick={(_e, edge) => setEditingEdge(edge.data.raw)}
          nodeTypes={nodeTypes}
          fitView fitViewOptions={{ padding: 0.3 }}
          minZoom={0.15} maxZoom={2}
          deleteKeyCode={null}
        >
          <Background color="var(--bg-elevated)" gap={24} size={1.5} />
          <Controls
            showInteractive={false}
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-active)', borderRadius: 10 }}
          />
          <MiniMap
            nodeColor={n => n.data?.isRoot ? 'var(--gold)' : 'var(--border-active)'}
            maskColor="rgba(15,23,42,0.7)"
            style={{ background: 'var(--bg-elevated)', border: '1px solid var(--border-active)', borderRadius: 10 }}
          />
          <FitViewButton />
        </ReactFlow>

        {/* Guide drawer */}
        {showGuide && (
          <div style={{
            position: 'absolute', top: 52, left: 12, zIndex: 20,
            background: 'var(--bg-elevated)', border: '1px solid var(--border-active)',
            borderRadius: 12, width: 240, maxHeight: 'calc(100% - 80px)',
            overflowY: 'auto', boxShadow: '0 8px 24px rgba(0,0,0,0.4)',
          }}>
            <div style={{ padding: '12px 14px', borderBottom: '1px solid var(--border-active)',
                          display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12, fontWeight: 700, color: 'var(--text)' }}><Icon name="book-open" size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Branch Tree Guide</span>
              <button onClick={() => setShowGuide(false)} style={{
                background: 'none', border: 'none', color: 'var(--text-dim)', cursor: 'pointer', fontSize: 16,
              }}>×</button>
            </div>
            <div style={{ padding: '12px 14px', fontSize: 11, color: 'var(--text-muted)', lineHeight: 1.6 }}>
              {[
                ['Steps', 'Define email content, subject, A/B variants in the Sequences tab. Set a Custom ID (e.g. INIT, FOLLOW1) for each step.'],
                ['Branch Tree', 'Define the send logic: which step sends first, what condition triggers the next step, how many days to wait.'],
                ['Add a step', 'Click + Add Step. A blank node appears. Go to Sequences tab to add content, subject, and Custom ID.'],
                ['Connect steps', 'Drag from the ○ right handle of one node to the left handle of another. A popup asks for condition + wait days.'],
                ['Edit connection', 'Click directly on the colored line (not the node box). An edit popup opens with pre-filled values.'],
                ['Delete', 'Click a connection line → Delete button. Or click a node → Delete this step.'],
              ].map(([title, text]) => (
                <div key={title} style={{ marginBottom: 10 }}>
                  <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 2 }}>{title}</div>
                  <div>{text}</div>
                </div>
              ))}
              <div style={{ borderTop: '1px solid var(--border-active)', paddingTop: 10, marginTop: 4 }}>
                <div style={{ fontWeight: 700, color: 'var(--text)', marginBottom: 6 }}>Conditions</div>
                {Object.entries(CONDITIONS).map(([k, v]) => (
                  <div key={k} style={{ display:'flex', alignItems:'center', gap:7, marginBottom:4 }}>
                    <span style={{ width:8, height:8, borderRadius:2, background:v.color, flexShrink:0, display:'inline-block' }} />
                    <span style={{ fontSize:10 }}>{v.label}</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Step info panel */}
      {selectedNode && (
        <div style={{
          width: 280, borderLeft: '1px solid var(--border-active)',
          display: 'flex', flexDirection: 'column', background: 'var(--bg)',
        }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '14px 16px', borderBottom: '1px solid var(--border-active)',
          }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ fontSize: 13, fontWeight: 700, color: 'var(--text)' }}>Step Info</span>
              {selectedNode.custom_id && (
                <span style={{
                  fontSize: 10, fontWeight: 800, color: 'var(--gold)', background: 'var(--gold-dim)',
                  border: '1px solid var(--gold-dim)', borderRadius: 5,
                  padding: '2px 8px', fontFamily: 'monospace',
                }}>
                  {selectedNode.custom_id}
                </span>
              )}
            </div>
            <button onClick={() => setSelectedNode(null)} style={{
              background: 'none', border: 'none', color: 'var(--text-dim)',
              cursor: 'pointer', fontSize: 18, lineHeight: 1,
            }}>×</button>
          </div>

          <div style={{ flex: 1, padding: '16px', overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 14 }}>
            {/* Info banner */}
            <div style={{
              background: 'var(--info-dim)', border: '1px solid var(--info)', borderRadius: 10,
              padding: '10px 12px', fontSize: 11, color: 'var(--info)', lineHeight: 1.5,
            }}>
              <strong>Branch tree = logic only.</strong> Edit content, subject, wait days, A/B variants in the <strong>Sequences tab</strong>.
            </div>

            {/* Fields */}
            {[
              ['LABEL', selectedNode.label || '—'],
              ['SUBJECT', selectedNode.subject || 'Replies in thread'],
            ].map(([label, val]) => (
              <div key={label}>
                <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: 1.5,
                              textTransform: 'uppercase', marginBottom: 4 }}>{label}</div>
                <div style={{ fontSize: 13, color: 'var(--text)', fontWeight: 500 }}>{val}</div>
              </div>
            ))}

            {/* Custom ID editor */}
            <div>
              <div style={{ fontSize: 9, fontWeight: 700, color: 'var(--text-dim)', letterSpacing: 1.5,
                            textTransform: 'uppercase', marginBottom: 6 }}>CUSTOM ID</div>
              <CustomIdEditor
                key={selectedNode.raw.id}
                nodeId={selectedNode.raw.id}
                initialValue={selectedNode.custom_id || ''}
                campaignId={campaignId}
                onSaved={(newId) => { setSelectedNode(n => ({ ...n, custom_id: newId })); load(); }}
              />
              <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
                Set ID → use in Sequences tab to link content
              </div>
            </div>

            {/* Badges */}
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {selectedNode.is_html && (
                <span style={{ fontSize: 10, background: 'var(--info-dim)', color: 'var(--info)',
                               borderRadius: 5, padding: '3px 8px', fontWeight: 700 }}>HTML</span>
              )}
              {selectedNode.isRoot && (
                <span style={{ fontSize: 10, background: 'var(--success-dim)', color: 'var(--success)',
                               borderRadius: 5, padding: '3px 8px', fontWeight: 700 }}>Start node</span>
              )}
              {selectedNode.variant_count > 0 && (
                <span style={{ fontSize: 10, background: 'var(--gold-dim)', color: 'var(--gold)',
                               borderRadius: 5, padding: '3px 8px', fontWeight: 700 }}>
                  A/B ×{selectedNode.variant_count}
                </span>
              )}
            </div>

            <div style={{ borderTop: '1px solid var(--border)', paddingTop: 10, fontSize: 10, color: 'var(--text-dim)' }}>
              <strong style={{ color: 'var(--text-dim)' }}>How to connect:</strong><br/>
              Drag from the <span style={{ fontFamily:'monospace', background:'var(--bg-elevated)', padding:'1px 4px', borderRadius:3 }}>○</span> right handle to another node's left handle. Set condition + wait days in the popup.<br/><br/>
              Click any arrow to edit or delete it.
            </div>
          </div>

          <div style={{ padding: '14px 16px', borderTop: '1px solid var(--border-active)', display: 'flex', flexDirection: 'column', gap: 8 }}>
            {onGoToSequences && (
              <button onClick={onGoToSequences} style={{
                background: 'linear-gradient(135deg, var(--gold-dark), var(--gold))', color: 'var(--on-gold)',
                border: 'none', borderRadius: 9, padding: '10px 14px', fontSize: 12,
                fontWeight: 700, cursor: 'pointer', width: '100%',
              }}>
                <Icon name="pencil" size={13} style={{ verticalAlign: '-2px', marginRight: 4 }} />Edit content in Sequences tab
              </button>
            )}
            <button onClick={() => deleteNode(selectedNode.raw.id)} style={{
              background: 'rgba(239,68,68,0.1)', color: 'var(--danger)',
              border: '1px solid rgba(239,68,68,0.3)', borderRadius: 9,
              padding: '9px 14px', fontSize: 12, fontWeight: 700, cursor: 'pointer', width: '100%',
            }}>
              Delete this step
            </button>
          </div>
        </div>
      )}

      {/* New connection modal */}
      {pendingEdge && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
        }} onMouseDown={e => { if (e.target === e.currentTarget) setPendingEdge(null); }}>
          <div style={{
            background: 'var(--bg-elevated)', border: '1px solid var(--border-active)', borderRadius: 20,
            boxShadow: '0 24px 48px rgba(0,0,0,0.5)', padding: 24, width: '100%', maxWidth: 360, margin: '0 16px',
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Set connection condition</h3>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>When should this next step send?</p>
            <EdgeConditionForm onConfirm={confirmEdge} onCancel={() => setPendingEdge(null)} />
          </div>
        </div>
      )}

      {/* Edit connection modal */}
      {editingEdge && (
        <div style={{
          position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.6)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 50,
        }} onMouseDown={e => { if (e.target === e.currentTarget) setEditingEdge(null); }}>
          <div style={{
            background: 'var(--bg-elevated)', border: '1px solid var(--border-active)', borderRadius: 20,
            boxShadow: '0 24px 48px rgba(0,0,0,0.5)', padding: 24, width: '100%', maxWidth: 360, margin: '0 16px',
          }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, color: 'var(--text)', marginBottom: 4 }}>Edit connection</h3>
            <p style={{ fontSize: 12, color: 'var(--text-dim)', marginBottom: 16 }}>Change the condition or timing.</p>
            <EdgeConditionForm initial={editingEdge} onConfirm={saveEditedEdge} onCancel={() => setEditingEdge(null)} />
            <button onClick={() => {
              if (window.confirm('Delete this connection?')) { deleteEdge(editingEdge.id); setEditingEdge(null); }
            }} style={{
              width: '100%', marginTop: 10, background: 'rgba(239,68,68,0.1)', color: 'var(--danger)',
              border: '1px solid rgba(239,68,68,0.3)', borderRadius: 9, padding: '9px',
              fontSize: 12, fontWeight: 600, cursor: 'pointer',
            }}>
              Delete this connection
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* ── Edge condition form ────────────────────────────────────────────── */
function EdgeConditionForm({ onConfirm, onCancel, initial }) {
  const [condition, setCondition]       = useState(initial?.condition_type || 'always');
  const [waitDays, setWaitDays]         = useState(initial?.wait_days ?? 3);
  const [waitMinutes, setWaitMinutes]   = useState(initial?.wait_minutes ?? 25);
  const [noReplyUnit, setNoReplyUnit]   = useState(
    initial?.no_reply_minutes && initial.no_reply_minutes >= 60 ? 'hours' : 'minutes'
  );
  const [noReplyValue, setNoReplyValue] = useState(() => {
    if (!initial?.no_reply_minutes) return 30;
    return initial.no_reply_minutes >= 60 ? Math.round(initial.no_reply_minutes / 60) : initial.no_reply_minutes;
  });

  const isNoReply = condition === 'opened_no_reply';
  const noReplyMinutes = isNoReply ? (noReplyUnit === 'hours' ? noReplyValue * 60 : noReplyValue) : null;

  const inputStyle = {
    background: 'var(--bg)', border: '1px solid var(--border-active)', borderRadius: 8,
    padding: '8px 12px', fontSize: 13, color: 'var(--text)', outline: 'none', width: '100%',
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 8,
                      textTransform: 'uppercase', letterSpacing: 1 }}>Condition</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 220, overflowY: 'auto' }}>
          {Object.entries(CONDITIONS).map(([key, val]) => (
            <label key={key} style={{
              display: 'flex', alignItems: 'center', gap: 10, padding: '9px 12px',
              borderRadius: 9, border: `1px solid ${condition === key ? val.color : 'var(--border-active)'}`,
              background: condition === key ? val.bg : 'var(--bg)', cursor: 'pointer', transition: 'all 0.1s',
            }}>
              <input type="radio" name="cond" value={key} checked={condition === key}
                onChange={() => setCondition(key)} style={{ accentColor: val.color }} />
              <span style={{ fontSize: 13, fontWeight: condition === key ? 700 : 400,
                             color: condition === key ? val.text || val.color : 'var(--text-muted)' }}>
                {val.label}
              </span>
            </label>
          ))}
        </div>
      </div>

      {isNoReply && (
        <div style={{
          background: 'var(--gold-dim)', border: '1px solid var(--border-active)', borderRadius: 10, padding: '12px 14px',
        }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gold)', marginBottom: 8 }}>
            No reply within:
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <input type="number" min={1} max={999} value={noReplyValue}
              onChange={e => setNoReplyValue(Number(e.target.value))}
              style={{ ...inputStyle, width: 80 }} />
            <select value={noReplyUnit} onChange={e => setNoReplyUnit(e.target.value)}
              style={{ ...inputStyle, width: 'auto', flex: 1 }}>
              <option value="minutes">minutes</option>
              <option value="hours">hours</option>
            </select>
          </div>
        </div>
      )}

      <div>
        <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6,
                      textTransform: 'uppercase', letterSpacing: 1 }}>Wait days before sending</div>
        <input type="number" min={0} max={90} value={waitDays}
          onChange={e => setWaitDays(Number(e.target.value))}
          style={inputStyle} />
        <div style={{ fontSize: 10, color: 'var(--text-dim)', marginTop: 4 }}>
          {condition === 'always' ? 'Sends this many days after the previous step.'
          : 'Wait this many days, then check the condition.'}
        </div>
      </div>

      {waitDays === 0 && (
        <div style={{ background: 'var(--info-dim)', border: '1px solid var(--gold)', borderRadius: 10, padding: '12px 14px' }}>
          <div style={{ fontSize: 11, fontWeight: 600, color: 'var(--gold)', marginBottom: 8,
                        textTransform: 'uppercase', letterSpacing: 1 }}>Wait minutes (since wait days = 0)</div>
          <input type="number" min={1} max={1440} value={waitMinutes}
            onChange={e => setWaitMinutes(Number(e.target.value))}
            style={{ background: 'var(--bg)', border: '1px solid var(--gold)', borderRadius: 8,
                     padding: '8px 12px', fontSize: 13, color: 'var(--text)', outline: 'none', width: '100%' }} />
          <div style={{ fontSize: 10, color: 'var(--gold)', marginTop: 4 }}>
            System waits this many minutes before checking the condition (1�1440).
          </div>
        </div>
      )}

      <div style={{ display: 'flex', gap: 8, paddingTop: 4 }}>
        <button onClick={() => onConfirm(condition, waitDays, waitMinutes, noReplyMinutes)} style={{
          flex: 1, background: 'linear-gradient(135deg, var(--gold-dark), var(--gold))', color: 'var(--on-gold)',
          border: 'none', borderRadius: 9, padding: '11px', fontSize: 13, fontWeight: 700, cursor: 'pointer',
        }}>
          {initial ? 'Save Changes' : 'Add Connection'}
        </button>
        <button onClick={onCancel} style={{
          background: 'var(--bg-input)', color: 'var(--text-muted)', border: 'none',
          borderRadius: 9, padding: '11px 16px', fontSize: 13, fontWeight: 600, cursor: 'pointer',
        }}>
          Cancel
        </button>
      </div>
    </div>
  );
}

/* ── Export ─────────────────────────────────────────────────────────── */
export default function SequenceTreeBuilder({ campaignId, onGoToSequences }) {
  return (
    <ReactFlowProvider>
      <TreeBuilderInner campaignId={campaignId} onGoToSequences={onGoToSequences} />
    </ReactFlowProvider>
  );
}
