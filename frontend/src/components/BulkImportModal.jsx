import { useState } from 'react';
import toast from 'react-hot-toast';
import { Upload, Eye, Check, FileText, AlertCircle } from 'lucide-react';
import Modal from './Modal';
import Button from './Button';
import { mcqApi } from '../api/endpoints';

const SAMPLE = `1. 2+2=?
A) 3
B) 4
C) 5
D) 6
Answer: B

2. What color is the sky on a clear day?
A) Red
B) Blue
C) Green
D) Pink
Answer: B

3. 5 x 2 = ?
A) 8
B) 9
C) 10
D) 11
Answer: C`;

export default function BulkImportModal({ examId, onClose, onImported }) {
  const [text, setText] = useState('');
  const [replace, setReplace] = useState(false);
  const [preview, setPreview] = useState(null);
  const [previewing, setPreviewing] = useState(false);
  const [importing, setImporting] = useState(false);

  const parsePreview = async () => {
    if (!text.trim()) return toast.error('Paste questions first');
    setPreviewing(true);
    try {
      const res = await mcqApi.importPreview(examId, text);
      setPreview(res.questions || []);
      toast.success(`${res.questions?.length || 0} question(s) detected`);
    } catch (e) {
      toast.error(e.message);
      setPreview(null);
    } finally {
      setPreviewing(false);
    }
  };

  const doImport = async () => {
    if (!text.trim()) return toast.error('Paste questions first');
    setImporting(true);
    try {
      const res = await mcqApi.importQuestions(examId, text, replace);
      toast.success(res?.message || 'Imported');
      onImported?.();
    } catch (e) {
      toast.error(e.message);
    } finally {
      setImporting(false);
    }
  };

  const useSample = () => {
    setText(SAMPLE);
    setPreview(null);
  };

  return (
    <Modal
      open
      onClose={onClose}
      title="Bulk Import Questions"
      size="xl"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="secondary" icon={Eye} onClick={parsePreview} loading={previewing}>
            Preview
          </Button>
          <Button icon={Upload} onClick={doImport} loading={importing} disabled={!text.trim()}>
            Import
          </Button>
        </>
      }
    >
      <div className="space-y-3">
        <div className="text-xs text-slate-500 bg-slate-50 dark:bg-slate-800 p-3 rounded-lg">
          <div className="font-medium text-slate-700 dark:text-slate-300 mb-1">Format</div>
          <pre className="font-mono text-[11px] whitespace-pre-wrap">
1. 2+2=?
A) 3
B) 4
C) 5
D) 6
Answer: B</pre>
          <div className="mt-2">
            • Question starts with <code>1.</code>, <code>1)</code>, or <code>Q1</code><br/>
            • Options start with <code>A)</code>, <code>A.</code>, or <code>(A)</code><br/>
            • Correct answer: <code>Answer: B</code> or <code>Ans: B</code> or <code>=&gt; B</code><br/>
            • Blank lines between questions are optional
          </div>
        </div>

        <div className="flex justify-end">
          <button type="button" onClick={useSample}
            className="text-xs text-brand-600 hover:underline">
            Paste sample
          </button>
        </div>

        <textarea
          value={text}
          onChange={(e) => { setText(e.target.value); setPreview(null); }}
          rows={12}
          className="input font-mono text-xs"
          placeholder="Paste questions here..."
        />

        <label className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <input type="checkbox" checked={replace}
                 onChange={(e) => setReplace(e.target.checked)}
                 className="rounded" />
          Replace all existing questions in this exam
        </label>

        {preview && (
          <div className="border border-slate-200 dark:border-slate-700 rounded-lg max-h-80 overflow-auto">
            <div className="px-3 py-2 bg-slate-50 dark:bg-slate-800 text-xs font-medium flex items-center justify-between">
              <span>Preview — {preview.length} question(s)</span>
              <span className="text-slate-400">not saved yet</span>
            </div>
            <div className="divide-y divide-slate-100 dark:divide-slate-700">
              {preview.map((q, i) => (
                <div key={i} className="p-3 text-xs">
                  <div className="flex items-center gap-2 font-medium">
                    <span className="font-mono bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded">
                      Q{q.q_number}
                    </span>
                    <span>{q.question_text || <em className="text-slate-400">no text</em>}</span>
                  </div>
                  <div className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-0.5">
                    {['a','b','c','d'].map((opt) => {
                      const val = q['option_' + opt];
                      const isCorrect = (q.correct_option || '').toLowerCase() === opt;
                      if (!val) return null;
                      return (
                        <div key={opt} className={isCorrect ? 'text-green-600 font-medium' : 'text-slate-600 dark:text-slate-400'}>
                          {opt.toUpperCase()}) {val} {isCorrect && '✓'}
                        </div>
                      );
                    })}
                  </div>
                  {!q.correct_option && (
                    <div className="text-amber-600 mt-1 flex items-center gap-1">
                      <AlertCircle className="w-3 h-3" /> No answer specified
                    </div>
                  )}
                </div>
              ))}
            </div>
          </div>
        )}
      </div>
    </Modal>
  );
}
