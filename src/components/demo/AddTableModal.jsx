import React, { useState } from 'react';
import {
  Table,
  Plus,
  Trash2,
  X,
  CheckCircle2,
  AlertCircle,
  Loader2,
  Sparkles,
  Key,
  Link,
  Layers,
} from 'lucide-react';
import { createCustomTable } from '../../services/api';

const PRESETS = [
  {
    name: 'marketing_campaigns',
    description: 'Ad campaign budgets, platforms, and conversion metrics',
    columns: [
      { name: 'id', type: 'INTEGER', primary_key: true, nullable: false },
      { name: 'campaign_name', type: 'VARCHAR(255)', primary_key: false, nullable: false },
      { name: 'channel', type: 'TEXT', primary_key: false, nullable: true },
      { name: 'budget_usd', type: 'REAL', primary_key: false, nullable: true },
      { name: 'conversions_count', type: 'INTEGER', primary_key: false, nullable: true },
      { name: 'status', type: 'TEXT', primary_key: false, nullable: true },
    ],
    foreign_keys: [],
    initial_rows: [
      { id: 1, campaign_name: 'Summer Growth Blitz 2026', channel: 'Google Search', budget_usd: 15000.0, conversions_count: 820, status: 'active' },
      { id: 2, campaign_name: 'LinkedIn Enterprise Inbound', channel: 'LinkedIn Ads', budget_usd: 28000.0, conversions_count: 430, status: 'active' },
      { id: 3, campaign_name: 'Q3 Product Hunt Launch', channel: 'Social/Community', budget_usd: 5000.0, conversions_count: 1250, status: 'completed' },
      { id: 4, campaign_name: 'AI Text-to-SQL Webinar Promo', channel: 'Email Newsletter', budget_usd: 3500.0, conversions_count: 610, status: 'completed' },
    ],
  },
  {
    name: 'customer_subscriptions',
    description: 'Recurring enterprise plan licenses and MRR records',
    columns: [
      { name: 'id', type: 'INTEGER', primary_key: true, nullable: false },
      { name: 'customer_id', type: 'INTEGER', primary_key: false, nullable: false },
      { name: 'plan_tier', type: 'TEXT', primary_key: false, nullable: false },
      { name: 'monthly_rate_usd', type: 'REAL', primary_key: false, nullable: false },
      { name: 'seats_count', type: 'INTEGER', primary_key: false, nullable: true },
      { name: 'is_active', type: 'BOOLEAN', primary_key: false, nullable: true },
    ],
    foreign_keys: [{ from_column: 'customer_id', to_table: 'customers', to_column: 'id' }],
    initial_rows: [
      { id: 1, customer_id: 1, plan_tier: 'Enterprise Dedicated', monthly_rate_usd: 2400.0, seats_count: 50, is_active: 1 },
      { id: 2, customer_id: 2, plan_tier: 'Growth Tier', monthly_rate_usd: 750.0, seats_count: 15, is_active: 1 },
      { id: 3, customer_id: 3, plan_tier: 'Enterprise Dedicated', monthly_rate_usd: 3200.0, seats_count: 80, is_active: 1 },
      { id: 4, customer_id: 4, plan_tier: 'Startup Starter', monthly_rate_usd: 250.0, seats_count: 5, is_active: 0 },
    ],
  },
];

export default function AddTableModal({ isOpen, onClose, connectionId = 'sqlite_demo', onTableCreated }) {
  const [tableName, setTableName] = useState('');
  const [description, setDescription] = useState('');
  const [columns, setColumns] = useState([
    { name: 'id', type: 'INTEGER', primary_key: true, nullable: false },
    { name: 'name', type: 'VARCHAR(255)', primary_key: false, nullable: false },
    { name: 'status', type: 'TEXT', primary_key: false, nullable: true },
  ]);
  const [foreignKeys, setForeignKeys] = useState([]);
  const [seedSampleData, setSeedSampleData] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState(null);

  if (!isOpen) return null;

  const handleApplyPreset = (preset) => {
    setTableName(preset.name);
    setDescription(preset.description);
    setColumns(preset.columns);
    setForeignKeys(preset.foreign_keys || []);
  };

  const handleAddColumn = () => {
    setColumns([
      ...columns,
      { name: `col_${columns.length + 1}`, type: 'TEXT', primary_key: false, nullable: true },
    ]);
  };

  const handleRemoveColumn = (index) => {
    if (columns.length <= 1) return;
    setColumns(columns.filter((_, i) => i !== index));
  };

  const handleColumnChange = (index, field, value) => {
    const updated = [...columns];
    updated[index][field] = value;
    setColumns(updated);
  };

  const handleSaveTable = async (e) => {
    e.preventDefault();
    if (!tableName.trim()) {
      setError('Please enter a valid table name.');
      return;
    }

    setIsSubmitting(true);
    setError(null);

    // Find preset initial rows if matched or generate synthetic
    let initialRows = [];
    const matchedPreset = PRESETS.find((p) => p.name === tableName.trim());
    if (seedSampleData) {
      if (matchedPreset && matchedPreset.initial_rows) {
        initialRows = matchedPreset.initial_rows;
      } else {
        // Simple synthetic sample
        initialRows = [
          { [columns[0].name]: 1, [columns[1]?.name || 'name']: 'Sample Record A' },
          { [columns[0].name]: 2, [columns[1]?.name || 'name']: 'Sample Record B' },
        ];
      }
    }

    try {
      const res = await createCustomTable(connectionId, {
        table_name: tableName.trim(),
        description: description.trim(),
        columns,
        foreign_keys: foreignKeys,
        initial_rows: initialRows,
      });
      if (onTableCreated) onTableCreated(res.catalog);
      onClose();
    } catch (err) {
      setError(err.message || 'Failed to create table.');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/50 backdrop-blur-sm">
      <div className="relative w-full max-w-2xl bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden flex flex-col max-h-[85vh] slide-in-up">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-indigo-600 text-white flex items-center justify-center font-bold shadow-md shadow-indigo-100">
              <Table className="w-4 h-4" />
            </div>
            <div>
              <h2 className="text-sm font-bold text-slate-900">Create New Relational Table</h2>
              <p className="text-[11px] text-slate-500">Define schema columns, data types, and foreign key relations</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/60 transition-all"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        {/* Form Body */}
        <form onSubmit={handleSaveTable} className="flex-1 p-6 overflow-y-auto space-y-5">
          {error && (
            <div className="p-3 rounded-xl bg-red-50 border border-red-200 text-red-700 text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 flex-shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Quick Presets */}
          <div className="space-y-1.5">
            <div className="flex items-center gap-1.5 text-xs font-bold text-slate-700">
              <Sparkles className="w-3.5 h-3.5 text-indigo-600" />
              <span>Quick Template Presets</span>
            </div>
            <div className="grid grid-cols-2 gap-2">
              {PRESETS.map((preset) => (
                <button
                  key={preset.name}
                  type="button"
                  onClick={() => handleApplyPreset(preset)}
                  className="p-2.5 rounded-xl text-left border border-slate-200 hover:border-indigo-300 hover:bg-indigo-50/50 transition-all bg-slate-50/50"
                >
                  <p className="text-xs font-bold text-indigo-700 font-mono">+{preset.name}</p>
                  <p className="text-[10px] text-slate-500 truncate">{preset.description}</p>
                </button>
              ))}
            </div>
          </div>

          {/* Table Name & Description */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Table Name</label>
              <input
                type="text"
                value={tableName}
                onChange={(e) => setTableName(e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                placeholder="e.g., marketing_campaigns"
                required
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-mono text-slate-900 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20 focus:border-indigo-500"
              />
            </div>
            <div>
              <label className="block text-xs font-bold text-slate-700 mb-1">Description (Optional)</label>
              <input
                type="text"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                placeholder="e.g., Marketing performance and ROI"
                className="w-full px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 focus:bg-white focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
              />
            </div>
          </div>

          {/* Columns Builder */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="block text-xs font-bold text-slate-700">Columns & Data Types</label>
              <button
                type="button"
                onClick={handleAddColumn}
                className="inline-flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-700"
              >
                <Plus className="w-3 h-3" />
                <span>Add Column</span>
              </button>
            </div>

            <div className="space-y-2 border border-slate-200 rounded-2xl p-3 bg-slate-50/50">
              {columns.map((col, idx) => (
                <div key={idx} className="flex items-center gap-2 text-xs">
                  {/* Column Name */}
                  <input
                    type="text"
                    value={col.name}
                    onChange={(e) => handleColumnChange(idx, 'name', e.target.value.toLowerCase().replace(/[^a-z0-9_]/g, ''))}
                    placeholder="column_name"
                    required
                    className="flex-1 px-2.5 py-1.5 bg-white border border-slate-200 rounded-lg font-mono text-xs text-slate-900 focus:outline-none focus:ring-2 focus:ring-indigo-500/20"
                  />

                  {/* Type */}
                  <select
                    value={col.type}
                    onChange={(e) => handleColumnChange(idx, 'type', e.target.value)}
                    className="w-32 px-2 py-1.5 bg-white border border-slate-200 rounded-lg text-xs font-medium text-slate-800 focus:outline-none"
                  >
                    <option value="INTEGER">INTEGER</option>
                    <option value="VARCHAR(255)">VARCHAR</option>
                    <option value="TEXT">TEXT</option>
                    <option value="REAL">REAL (Float)</option>
                    <option value="TIMESTAMP">TIMESTAMP</option>
                    <option value="BOOLEAN">BOOLEAN</option>
                  </select>

                  {/* Primary Key Check */}
                  <label className="inline-flex items-center gap-1 text-[11px] font-semibold text-slate-600 cursor-pointer select-none">
                    <input
                      type="checkbox"
                      checked={col.primary_key}
                      onChange={(e) => handleColumnChange(idx, 'primary_key', e.target.checked)}
                      className="rounded text-indigo-600 focus:ring-indigo-500"
                    />
                    <Key className="w-3 h-3 text-amber-500" />
                    <span>PK</span>
                  </label>

                  {/* Delete Column */}
                  <button
                    type="button"
                    onClick={() => handleRemoveColumn(idx)}
                    disabled={columns.length <= 1}
                    className="p-1 text-slate-400 hover:text-red-500 disabled:opacity-30 transition-all"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              ))}
            </div>
          </div>

          {/* Seed Sample Rows Toggle */}
          <div className="flex items-center gap-2 p-3 rounded-xl bg-indigo-50/70 border border-indigo-100">
            <input
              type="checkbox"
              id="seed_check"
              checked={seedSampleData}
              onChange={(e) => setSeedSampleData(e.target.checked)}
              className="rounded text-indigo-600 focus:ring-indigo-500"
            />
            <label htmlFor="seed_check" className="text-xs text-slate-800 font-medium cursor-pointer">
              Automatically populate 4 synthetic sample records for value-grounding exploration
            </label>
          </div>

          {/* Footer Actions */}
          <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-3 py-2 text-xs font-semibold text-slate-600 hover:bg-slate-100 rounded-xl transition-all"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting || !tableName.trim()}
              className="inline-flex items-center gap-1.5 px-4 py-2 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold rounded-xl shadow-md shadow-indigo-100 disabled:opacity-50 transition-all"
            >
              {isSubmitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <Plus className="w-3.5 h-3.5" />}
              <span>Create Table & Update Catalog</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
