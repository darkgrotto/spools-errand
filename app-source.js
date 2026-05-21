const { useState, useEffect, useMemo, useRef, useCallback } = React;

const ROLL_TYPES = ['Standard 88-note', 'Ampico', 'Duo-Art', 'Welte-Mignon', 'Other'];
const CONDITIONS = ['Mint', 'Excellent', 'Good', 'Fair', 'Poor'];
const STORAGE_KEY = 'spoolsErrandCollection';

const emptyRoll = {
  manufacturer: '', rollNumber: '', title: '', artist: '', composer: '',
  year: '', catalogSeries: '', rollLength: '', rollType: 'Standard 88-note',
  extendedPlay: false, wordRoll: false, condition: 'Good', quantity: 1,
  purchaseCost: '', storageLocation: '', notes: ''
};

function SpoolsErrandApp() {
  const [rolls, setRolls] = useState([]);
  const [showForm, setShowForm] = useState(false);
  const [editingId, setEditingId] = useState(null);
  const [formData, setFormData] = useState(emptyRoll);
  const [searchQuery, setSearchQuery] = useState('');
  const [filterManufacturer, setFilterManufacturer] = useState('');
  const [filterRollType, setFilterRollType] = useState('');
  const [filterEP, setFilterEP] = useState('');
  const [filterWord, setFilterWord] = useState('');
  const [sortField, setSortField] = useState('title');
  const [sortDir, setSortDir] = useState('asc');
  const [showStats, setShowStats] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [dupWarning, setDupWarning] = useState(null);
  const [backend, setBackend] = useState({ connected: false, rollCount: 0 });
  const [backendMfgs, setBackendMfgs] = useState([]);
  const [lookupResults, setLookupResults] = useState(null);
  const [lookupLoading, setLookupLoading] = useState(false);
  const [suggestions, setSuggestions] = useState([]);
  const [activeField, setActiveField] = useState(null);
  const timerRef = useRef(null);

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (stored) { try { setRolls(JSON.parse(stored)); } catch (e) {} }
    checkBackend();
  }, []);

  const save = (newRolls) => {
    setRolls(newRolls);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(newRolls));
  };

  const checkBackend = async () => {
    try {
      const res = await fetch('/api/health');
      if (res.ok) {
        const data = await res.json();
        setBackend({ connected: true, rollCount: data.rollCount });
        const m = await fetch('/api/manufacturers');
        if (m.ok) {
          const d = await m.json();
          setBackendMfgs(d.manufacturers.map(x => x.manufacturer));
        }
      }
    } catch (e) {
      setBackend({ connected: false, rollCount: 0 });
    }
  };

  const handleLookup = async () => {
    if (!formData.manufacturer || !formData.rollNumber) {
      alert('Enter Manufacturer and Roll Number first.');
      return;
    }
    setLookupLoading(true);
    try {
      const url = '/api/lookup?manufacturer=' + encodeURIComponent(formData.manufacturer) +
                  '&rollNumber=' + encodeURIComponent(formData.rollNumber);
      const res = await fetch(url);
      const data = await res.json();
      if (data.found && data.results.length > 0) setLookupResults(data.results);
      else alert('No matches found for ' + formData.manufacturer + ' #' + formData.rollNumber);
    } catch (e) {
      alert('Lookup failed: ' + e.message);
    } finally {
      setLookupLoading(false);
    }
  };

  const applyResult = (r) => {
    setFormData({
      ...formData,
      title: r.title || formData.title, artist: r.artist || formData.artist,
      composer: r.composer || formData.composer, year: r.year || formData.year,
      catalogSeries: r.catalogSeries || formData.catalogSeries,
      rollType: r.rollType || formData.rollType,
      extendedPlay: r.extendedPlay, wordRoll: r.wordRoll
    });
    setLookupResults(null);
  };

  const suggest = useCallback((field, value) => {
    if (timerRef.current) clearTimeout(timerRef.current);
    if (!value || value.trim().length < 2) {
      setSuggestions([]); setActiveField(null); return;
    }
    setActiveField(field);
    timerRef.current = setTimeout(async () => {
      try {
        const res = await fetch('/api/search?q=' + encodeURIComponent(value) + '&limit=8');
        const data = await res.json();
        setSuggestions(data.results || []);
      } catch (e) { setSuggestions([]); }
    }, 300);
  }, []);

  const pickSuggestion = (s) => {
    setFormData({
      ...formData,
      manufacturer: s.manufacturer || formData.manufacturer,
      rollNumber: s.rollNumber || formData.rollNumber,
      title: s.title || formData.title, artist: s.artist || formData.artist,
      composer: s.composer || formData.composer, year: s.year || formData.year,
      catalogSeries: s.catalogSeries || formData.catalogSeries,
      rollType: s.rollType || formData.rollType,
      extendedPlay: s.extendedPlay, wordRoll: s.wordRoll
    });
    setSuggestions([]); setActiveField(null);
  };

  const fieldChange = (field, value) => {
    setFormData({ ...formData, [field]: value });
    if (['title', 'artist', 'composer'].includes(field)) suggest(field, value);
  };

  const submit = () => {
    if (!formData.manufacturer || !formData.rollNumber || !formData.title) {
      alert('Manufacturer, Roll Number, and Title are required.'); return;
    }
    if (!editingId) {
      const existing = rolls.find(r =>
        r.manufacturer.toLowerCase() === formData.manufacturer.toLowerCase() &&
        r.rollNumber.toLowerCase() === formData.rollNumber.toLowerCase());
      if (existing && !dupWarning) { setDupWarning(existing); return; }
    }
    const newRolls = editingId
      ? rolls.map(r => r.id === editingId ? { ...formData, id: editingId } : r)
      : [...rolls, { ...formData, id: Date.now().toString() }];
    save(newRolls); reset();
  };

  const incDup = () => {
    save(rolls.map(r => r.id === dupWarning.id
      ? { ...r, quantity: parseInt(r.quantity) + parseInt(formData.quantity || 1) }
      : r));
    reset();
  };

  const reset = () => {
    setFormData(emptyRoll); setEditingId(null); setShowForm(false);
    setDupWarning(null); setLookupResults(null);
    setSuggestions([]); setActiveField(null);
  };

  const edit = (roll) => { setFormData(roll); setEditingId(roll.id); setShowForm(true); };
  const del = (id) => {
    if (confirm('Delete this roll?')) save(rolls.filter(r => r.id !== id));
  };

  const exportJSON = () => {
    const blob = new Blob([JSON.stringify(rolls, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'spools-errand-' + new Date().toISOString().split('T')[0] + '.json';
    a.click(); URL.revokeObjectURL(url);
  };

  const exportCSV = () => {
    if (rolls.length === 0) return;
    const headers = ['Manufacturer','Roll Number','Title','Artist','Composer','Year','Catalog Series','Roll Length','Roll Type','Extended Play','Word Roll','Condition','Quantity','Purchase Cost','Storage Location','Notes'];
    const rows = rolls.map(r => [r.manufacturer, r.rollNumber, r.title, r.artist, r.composer, r.year, r.catalogSeries, r.rollLength, r.rollType, r.extendedPlay?'Yes':'No', r.wordRoll?'Yes':'No', r.condition, r.quantity, r.purchaseCost, r.storageLocation, r.notes]);
    const csv = [headers, ...rows].map(row => row.map(c => '"' + String(c||'').replace(/"/g,'""') + '"').join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = 'spools-errand-' + new Date().toISOString().split('T')[0] + '.csv';
    a.click(); URL.revokeObjectURL(url);
  };

  const importFile = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = (ev) => {
      try {
        const imp = JSON.parse(ev.target.result);
        if (Array.isArray(imp) && confirm('Import ' + imp.length + ' rolls?')) {
          save([...rolls, ...imp.map(r => ({ ...r, id: r.id || Date.now().toString() + Math.random() }))]);
        }
      } catch (err) { alert('Invalid file format.'); }
    };
    reader.readAsText(file);
    e.target.value = '';
  };

  const filtered = useMemo(() => {
    let result = rolls.filter(r => {
      const q = searchQuery.toLowerCase();
      const matchSearch = !q || [r.manufacturer, r.rollNumber, r.title, r.artist, r.composer, r.catalogSeries, r.notes, r.storageLocation].some(f => String(f||'').toLowerCase().includes(q));
      const matchMfg = !filterManufacturer || r.manufacturer === filterManufacturer;
      const matchType = !filterRollType || r.rollType === filterRollType;
      const matchEP = filterEP === '' || r.extendedPlay === (filterEP === 'yes');
      const matchWord = filterWord === '' || r.wordRoll === (filterWord === 'yes');
      return matchSearch && matchMfg && matchType && matchEP && matchWord;
    });
    result.sort((a, b) => {
      let av = a[sortField], bv = b[sortField];
      if (typeof av === 'string') av = av.toLowerCase();
      if (typeof bv === 'string') bv = bv.toLowerCase();
      if (av < bv) return sortDir === 'asc' ? -1 : 1;
      if (av > bv) return sortDir === 'asc' ? 1 : -1;
      return 0;
    });
    return result;
  }, [rolls, searchQuery, filterManufacturer, filterRollType, filterEP, filterWord, sortField, sortDir]);

  const stats = useMemo(() => {
    const totalRolls = rolls.reduce((s, r) => s + parseInt(r.quantity || 1), 0);
    const uniqueTitles = new Set(rolls.map(r => r.title.toLowerCase())).size;
    const totalCost = rolls.reduce((s, r) => s + (parseFloat(r.purchaseCost) || 0) * parseInt(r.quantity || 1), 0);
    const byMfg = {}, byType = {};
    rolls.forEach(r => {
      const qty = parseInt(r.quantity || 1);
      byMfg[r.manufacturer] = (byMfg[r.manufacturer] || 0) + qty;
      byType[r.rollType] = (byType[r.rollType] || 0) + qty;
    });
    return { totalRolls, uniqueTitles, totalCost, byMfg, byType };
  }, [rolls]);

  const doSort = (field) => {
    if (sortField === field) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortField(field); setSortDir('asc'); }
  };

  const mfgOptions = useMemo(() => {
    const local = [...new Set(rolls.map(r => r.manufacturer).filter(Boolean))];
    return [...new Set([...backendMfgs, ...local])].sort();
  }, [backendMfgs, rolls]);

  const SH = ({ field, children }) => (
    <th onClick={() => doSort(field)}
        className="px-3 py-2 text-left text-xs font-semibold uppercase tracking-wider cursor-pointer hover:bg-amber-100 select-none"
        style={{ color: '#5c3a1e' }}>
      {children} {sortField === field && (sortDir === 'asc' ? '▲' : '▼')}
    </th>
  );

  const Suggest = ({ items, onPick, onClose }) => (
    <div className="absolute z-20 mt-1 w-full rounded border shadow-lg max-h-64 overflow-y-auto"
         style={{ backgroundColor: '#fff', borderColor: '#8b5a2b' }}>
      {items.map((s, i) => (
        <button key={i} onClick={() => onPick(s)}
                className="block w-full text-left p-2 text-sm hover:bg-amber-50 border-b last:border-0"
                style={{ borderColor: '#e8d9b8', color: '#5c3a1e' }}>
          <div className="font-semibold">{s.title}</div>
          <div className="text-xs" style={{ color: '#8b5a2b' }}>
            {s.manufacturer} #{s.rollNumber}
            {s.composer && (' · ' + s.composer)}
            {s.artist && (' · ' + s.artist)}
            {s.year && (' · ' + s.year)}
          </div>
        </button>
      ))}
      <button onClick={onClose} className="block w-full text-center p-1 text-xs italic" style={{ color: '#8b5a2b' }}>Close</button>
    </div>
  );

  return (
    <div className="min-h-screen p-4" style={{ backgroundColor: '#f5ecd9' }}>
      <div className="max-w-7xl mx-auto">
        <div className="mb-6 pb-4 border-b-2" style={{ borderColor: '#8b5a2b' }}>
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-4xl font-bold" style={{ color: '#5c3a1e' }}>Spool's Errand</h1>
              <p className="text-sm italic" style={{ color: '#8b5a2b' }}>A catalog of your player piano roll library</p>
            </div>
            <div className="text-xs" style={{ color: '#8b5a2b' }}>
              {backend.connected ? 'Catalog: ' + backend.rollCount.toLocaleString() + ' rolls' : 'Backend offline'}
            </div>
          </div>
        </div>

        <div className="flex flex-wrap gap-2 mb-4">
          <button onClick={() => { reset(); setShowForm(true); }} className="px-3 py-2 rounded text-sm font-semibold text-white hover:opacity-90" style={{ backgroundColor: '#8b5a2b' }}>+ Add Roll</button>
          <button onClick={() => setShowStats(!showStats)} className="px-3 py-2 rounded text-sm font-semibold hover:opacity-90" style={{ backgroundColor: '#e8d9b8', color: '#5c3a1e' }}>{showStats ? 'Hide' : 'Show'} Stats</button>
          <button onClick={() => setShowFilters(!showFilters)} className="px-3 py-2 rounded text-sm font-semibold hover:opacity-90" style={{ backgroundColor: '#e8d9b8', color: '#5c3a1e' }}>Filters</button>
          <button onClick={exportJSON} disabled={rolls.length === 0} className="px-3 py-2 rounded text-sm font-semibold hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#e8d9b8', color: '#5c3a1e' }}>Export JSON</button>
          <button onClick={exportCSV} disabled={rolls.length === 0} className="px-3 py-2 rounded text-sm font-semibold hover:opacity-90 disabled:opacity-50" style={{ backgroundColor: '#e8d9b8', color: '#5c3a1e' }}>Export CSV</button>
          <label className="px-3 py-2 rounded text-sm font-semibold hover:opacity-90 cursor-pointer" style={{ backgroundColor: '#e8d9b8', color: '#5c3a1e' }}>
            Import<input type="file" accept=".json" onChange={importFile} className="hidden" />
          </label>
        </div>

        {showStats && (
          <div className="mb-4 p-4 rounded border" style={{ backgroundColor: '#faf3e3', borderColor: '#8b5a2b' }}>
            <h2 className="text-xl font-bold mb-3" style={{ color: '#5c3a1e' }}>Collection Statistics</h2>
            <div className="grid grid-cols-3 gap-4">
              <div><div className="text-3xl font-bold" style={{ color: '#5c3a1e' }}>{stats.totalRolls}</div><div className="text-sm" style={{ color: '#8b5a2b' }}>Total Rolls</div></div>
              <div><div className="text-3xl font-bold" style={{ color: '#5c3a1e' }}>{stats.uniqueTitles}</div><div className="text-sm" style={{ color: '#8b5a2b' }}>Unique Titles</div></div>
              <div><div className="text-3xl font-bold" style={{ color: '#5c3a1e' }}>${stats.totalCost.toFixed(2)}</div><div className="text-sm" style={{ color: '#8b5a2b' }}>Total Invested</div></div>
            </div>
          </div>
        )}

        <div className="mb-4 p-3 rounded border" style={{ backgroundColor: '#faf3e3', borderColor: '#8b5a2b' }}>
          <input type="text" placeholder="Search your collection..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)}
                 className="w-full px-3 py-2 rounded border" style={{ borderColor: '#8b5a2b', backgroundColor: '#fff', color: '#5c3a1e' }} />
          {showFilters && (
            <div className="grid grid-cols-4 gap-2 mt-2">
              <select value={filterManufacturer} onChange={(e) => setFilterManufacturer(e.target.value)} className="px-2 py-1 rounded border text-sm" style={{ borderColor: '#8b5a2b' }}>
                <option value="">All Manufacturers</option>
                {[...new Set(rolls.map(r => r.manufacturer))].sort().map(m => <option key={m} value={m}>{m}</option>)}
              </select>
              <select value={filterRollType} onChange={(e) => setFilterRollType(e.target.value)} className="px-2 py-1 rounded border text-sm" style={{ borderColor: '#8b5a2b' }}>
                <option value="">All Roll Types</option>
                {ROLL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}
              </select>
              <select value={filterEP} onChange={(e) => setFilterEP(e.target.value)} className="px-2 py-1 rounded border text-sm" style={{ borderColor: '#8b5a2b' }}>
                <option value="">EP: Any</option><option value="yes">Yes</option><option value="no">No</option>
              </select>
              <select value={filterWord} onChange={(e) => setFilterWord(e.target.value)} className="px-2 py-1 rounded border text-sm" style={{ borderColor: '#8b5a2b' }}>
                <option value="">Word: Any</option><option value="yes">Yes</option><option value="no">No</option>
              </select>
            </div>
          )}
        </div>

        <div className="rounded border overflow-x-auto" style={{ backgroundColor: '#fff', borderColor: '#8b5a2b' }}>
          {filtered.length === 0 ? (
            <div className="p-8 text-center" style={{ color: '#8b5a2b' }}>
              {rolls.length === 0
                ? <div><p className="text-lg">Your collection is empty.</p><p className="text-sm">Click "Add Roll" to begin.</p></div>
                : <p>No rolls match your search.</p>}
            </div>
          ) : (
            <table className="w-full text-sm">
              <thead style={{ backgroundColor: '#f5ecd9' }}>
                <tr>
                  <SH field="manufacturer">Manufacturer</SH>
                  <SH field="rollNumber">Roll #</SH>
                  <SH field="title">Title</SH>
                  <SH field="artist">Artist</SH>
                  <SH field="composer">Composer</SH>
                  <SH field="rollType">Type</SH>
                  <SH field="condition">Condition</SH>
                  <SH field="quantity">Qty</SH>
                  <th className="px-3 py-2 text-left text-xs font-semibold uppercase" style={{ color: '#5c3a1e' }}>Flags</th>
                  <th className="px-3 py-2 text-right text-xs font-semibold uppercase" style={{ color: '#5c3a1e' }}>Actions</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map((roll, idx) => (
                  <tr key={roll.id} style={{ backgroundColor: idx % 2 === 0 ? '#fff' : '#faf3e3', color: '#5c3a1e' }}>
                    <td className="px-3 py-2">{roll.manufacturer}</td>
                    <td className="px-3 py-2 font-mono text-xs">{roll.rollNumber}</td>
                    <td className="px-3 py-2 font-semibold">{roll.title}</td>
                    <td className="px-3 py-2">{roll.artist}</td>
                    <td className="px-3 py-2 italic">{roll.composer}</td>
                    <td className="px-3 py-2 text-xs">{roll.rollType}</td>
                    <td className="px-3 py-2 text-xs">{roll.condition}</td>
                    <td className="px-3 py-2 text-center font-semibold">{roll.quantity}</td>
                    <td className="px-3 py-2 text-xs">
                      {roll.extendedPlay && <span className="inline-block px-1 mr-1 rounded" style={{ backgroundColor: '#8b5a2b', color: '#fff' }}>EP</span>}
                      {roll.wordRoll && <span className="inline-block px-1 rounded" style={{ backgroundColor: '#5c3a1e', color: '#fff' }}>W</span>}
                    </td>
                    <td className="px-3 py-2 text-right whitespace-nowrap">
                      <button onClick={() => edit(roll)} className="text-xs underline hover:opacity-70">Edit</button>
                      <button onClick={() => del(roll.id)} className="ml-2 text-xs underline hover:opacity-70">Delete</button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="mt-2 text-xs text-right italic" style={{ color: '#8b5a2b' }}>
          Showing {filtered.length} of {rolls.length} roll{rolls.length !== 1 ? 's' : ''}
        </div>

        {showForm && (
          <div className="fixed inset-0 flex items-center justify-center z-50 p-4" style={{ backgroundColor: 'rgba(92, 58, 30, 0.6)' }}>
            <div className="rounded-lg max-w-2xl w-full max-h-[90vh] overflow-y-auto" style={{ backgroundColor: '#faf3e3' }}>
              <div className="p-4 border-b flex justify-between items-center sticky top-0" style={{ backgroundColor: '#faf3e3', borderColor: '#8b5a2b' }}>
                <h2 className="text-xl font-bold" style={{ color: '#5c3a1e' }}>{editingId ? 'Edit Roll' : 'Add New Roll'}</h2>
                <button onClick={reset} style={{ color: '#5c3a1e' }}>Close</button>
              </div>

              {lookupResults && (
                <div className="m-4 p-3 rounded border-2" style={{ borderColor: '#5c8b2b', backgroundColor: '#f4f9e7' }}>
                  <p className="font-semibold mb-2" style={{ color: '#5c3a1e' }}>Found {lookupResults.length} match{lookupResults.length !== 1 ? 'es' : ''}</p>
                  <div className="space-y-1">
                    {lookupResults.map((r, i) => (
                      <button key={i} onClick={() => applyResult(r)} className="block w-full text-left p-2 rounded text-sm hover:opacity-80" style={{ backgroundColor: '#fff', color: '#5c3a1e' }}>
                        <div className="font-semibold">{r.title}</div>
                        <div className="text-xs" style={{ color: '#8b5a2b' }}>
                          {r.composer && (r.composer + ' · ')}{r.artist && (r.artist + ' · ')}{r.rollType}
                          {r.year && (' · ' + r.year)}{r.source && (' · ' + r.source)}
                        </div>
                      </button>
                    ))}
                  </div>
                  <button onClick={() => setLookupResults(null)} className="mt-2 px-2 py-1 rounded text-xs" style={{ backgroundColor: '#e8d9b8', color: '#5c3a1e' }}>Cancel</button>
                </div>
              )}

              {dupWarning && (
                <div className="m-4 p-3 rounded border-2" style={{ borderColor: '#8b5a2b', backgroundColor: '#fff8e1' }}>
                  <p className="font-semibold" style={{ color: '#5c3a1e' }}>Possible duplicate found</p>
                  <p className="text-sm" style={{ color: '#5c3a1e' }}>You already have "{dupWarning.title}" ({dupWarning.manufacturer} #{dupWarning.rollNumber}) with quantity {dupWarning.quantity}.</p>
                  <div className="flex gap-2 mt-2">
                    <button onClick={incDup} className="px-3 py-1 rounded text-sm text-white" style={{ backgroundColor: '#8b5a2b' }}>Increment Quantity</button>
                    <button onClick={() => setDupWarning(null)} className="px-3 py-1 rounded text-sm" style={{ backgroundColor: '#e8d9b8', color: '#5c3a1e' }}>Add Anyway</button>
                  </div>
                </div>
              )}

              <div className="p-4 grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-semibold mb-1" style={{ color: '#5c3a1e' }}>Manufacturer *</label>
                  <input type="text" list="mfg-list" value={formData.manufacturer} onChange={(e) => setFormData({ ...formData, manufacturer: e.target.value })} className="w-full px-2 py-1 rounded border" style={{ borderColor: '#8b5a2b' }} />
                  <datalist id="mfg-list">{mfgOptions.map(m => <option key={m} value={m} />)}</datalist>
                </div>
                <div>
                  <label className="block text-sm font-semibold mb-1" style={{ color: '#5c3a1e' }}>Roll Number *</label>
                  <div className="flex gap-1">
                    <input type="text" value={formData.rollNumber} onChange={(e) => setFormData({ ...formData, rollNumber: e.target.value })} className="flex-1 px-2 py-1 rounded border" style={{ borderColor: '#8b5a2b' }} />
                    <button onClick={handleLookup} disabled={!backend.connected || lookupLoading} className="px-2 py-1 rounded text-xs font-semibold text-white disabled:opacity-50" style={{ backgroundColor: '#5c8b2b' }}>{lookupLoading ? '...' : 'Lookup'}</button>
                  </div>
                </div>
                <div className="col-span-2 relative">
                  <label className="block text-sm font-semibold mb-1" style={{ color: '#5c3a1e' }}>Title *</label>
                  <input type="text" value={formData.title} onChange={(e) => fieldChange('title', e.target.value)} className="w-full px-2 py-1 rounded border" style={{ borderColor: '#8b5a2b' }} />
                  {activeField === 'title' && suggestions.length > 0 && <Suggest items={suggestions} onPick={pickSuggestion} onClose={() => { setSuggestions([]); setActiveField(null); }} />}
                </div>
                <div className="relative">
                  <label className="block text-sm font-semibold mb-1" style={{ color: '#5c3a1e' }}>Artist</label>
                  <input type="text" value={formData.artist} onChange={(e) => fieldChange('artist', e.target.value)} className="w-full px-2 py-1 rounded border" style={{ borderColor: '#8b5a2b' }} />
                  {activeField === 'artist' && suggestions.length > 0 && <Suggest items={suggestions} onPick={pickSuggestion} onClose={() => { setSuggestions([]); setActiveField(null); }} />}
                </div>
                <div className="relative">
                  <label className="block text-sm font-semibold mb-1" style={{ color: '#5c3a1e' }}>Composer</label>
                  <input type="text" value={formData.composer} onChange={(e) => fieldChange('composer', e.target.value)} className="w-full px-2 py-1 rounded border" style={{ borderColor: '#8b5a2b' }} />
                  {activeField === 'composer' && suggestions.length > 0 && <Suggest items={suggestions} onPick={pickSuggestion} onClose={() => { setSuggestions([]); setActiveField(null); }} />}
                </div>
                <div><label className="block text-sm font-semibold mb-1" style={{ color: '#5c3a1e' }}>Year</label><input type="text" value={formData.year} onChange={(e) => setFormData({ ...formData, year: e.target.value })} className="w-full px-2 py-1 rounded border" style={{ borderColor: '#8b5a2b' }} /></div>
                <div><label className="block text-sm font-semibold mb-1" style={{ color: '#5c3a1e' }}>Catalog Series</label><input type="text" value={formData.catalogSeries} onChange={(e) => setFormData({ ...formData, catalogSeries: e.target.value })} className="w-full px-2 py-1 rounded border" style={{ borderColor: '#8b5a2b' }} /></div>
                <div><label className="block text-sm font-semibold mb-1" style={{ color: '#5c3a1e' }}>Roll Length</label><input type="text" value={formData.rollLength} onChange={(e) => setFormData({ ...formData, rollLength: e.target.value })} className="w-full px-2 py-1 rounded border" style={{ borderColor: '#8b5a2b' }} /></div>
                <div><label className="block text-sm font-semibold mb-1" style={{ color: '#5c3a1e' }}>Roll Type</label><select value={formData.rollType} onChange={(e) => setFormData({ ...formData, rollType: e.target.value })} className="w-full px-2 py-1 rounded border" style={{ borderColor: '#8b5a2b' }}>{ROLL_TYPES.map(t => <option key={t} value={t}>{t}</option>)}</select></div>
                <div><label className="block text-sm font-semibold mb-1" style={{ color: '#5c3a1e' }}>Condition</label><select value={formData.condition} onChange={(e) => setFormData({ ...formData, condition: e.target.value })} className="w-full px-2 py-1 rounded border" style={{ borderColor: '#8b5a2b' }}>{CONDITIONS.map(c => <option key={c} value={c}>{c}</option>)}</select></div>
                <div><label className="block text-sm font-semibold mb-1" style={{ color: '#5c3a1e' }}>Quantity</label><input type="number" min="1" value={formData.quantity} onChange={(e) => setFormData({ ...formData, quantity: e.target.value })} className="w-full px-2 py-1 rounded border" style={{ borderColor: '#8b5a2b' }} /></div>
                <div><label className="block text-sm font-semibold mb-1" style={{ color: '#5c3a1e' }}>Purchase Cost ($)</label><input type="number" step="0.01" min="0" value={formData.purchaseCost} onChange={(e) => setFormData({ ...formData, purchaseCost: e.target.value })} className="w-full px-2 py-1 rounded border" style={{ borderColor: '#8b5a2b' }} /></div>
                <div className="col-span-2 flex gap-4">
                  <label className="flex items-center gap-2" style={{ color: '#5c3a1e' }}><input type="checkbox" checked={formData.extendedPlay} onChange={(e) => setFormData({ ...formData, extendedPlay: e.target.checked })} /><span className="text-sm font-semibold">Extended Play Roll</span></label>
                  <label className="flex items-center gap-2" style={{ color: '#5c3a1e' }}><input type="checkbox" checked={formData.wordRoll} onChange={(e) => setFormData({ ...formData, wordRoll: e.target.checked })} /><span className="text-sm font-semibold">Word Roll</span></label>
                </div>
                <div className="col-span-2"><label className="block text-sm font-semibold mb-1" style={{ color: '#5c3a1e' }}>Storage Location</label><input type="text" value={formData.storageLocation} onChange={(e) => setFormData({ ...formData, storageLocation: e.target.value })} className="w-full px-2 py-1 rounded border" style={{ borderColor: '#8b5a2b' }} /></div>
                <div className="col-span-2"><label className="block text-sm font-semibold mb-1" style={{ color: '#5c3a1e' }}>Notes</label><textarea value={formData.notes} rows="3" onChange={(e) => setFormData({ ...formData, notes: e.target.value })} className="w-full px-2 py-1 rounded border" style={{ borderColor: '#8b5a2b' }} /></div>
              </div>

              <div className="p-4 border-t flex justify-end gap-2 sticky bottom-0" style={{ backgroundColor: '#faf3e3', borderColor: '#8b5a2b' }}>
                <button onClick={reset} className="px-4 py-2 rounded font-semibold" style={{ backgroundColor: '#e8d9b8', color: '#5c3a1e' }}>Cancel</button>
                <button onClick={submit} className="px-4 py-2 rounded font-semibold text-white" style={{ backgroundColor: '#8b5a2b' }}>{editingId ? 'Save Changes' : 'Add Roll'}</button>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

ReactDOM.createRoot(document.getElementById('root')).render(<SpoolsErrandApp />);
