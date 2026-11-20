import React from 'react';

export default function BatchConfirmModal({
  isOpen,
  validItems = [],
  invalidItems = [],
  onConfirm,
  onCancel,
}) {
  if (!isOpen) return null;

  return (
    <div
      style={{
        position: 'fixed',
        inset: 0,
        backgroundColor: 'rgba(0, 0, 0, 0.45)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        zIndex: 9999,
      }}
    >
      <div
        style={{
          background: '#fff',
          borderRadius: '8px',
          padding: '20px',
          width: '92%',
          maxWidth: '540px',
          maxHeight: '80vh',
          overflowY: 'auto',
          boxShadow: '0 10px 30px rgba(0, 0, 0, 0.2)',
        }}
      >
        <h3 style={{ marginTop: 0 }}>Confirm Timetable Submission</h3>
        <p style={{ margin: '0 0 12px', color: '#374151' }}>
          The following <strong>{validItems.length}</strong> slot(s) will be submitted:
        </p>

        {validItems.length === 0 ? (
          <p style={{ color: '#b91c1c', fontWeight: 500 }}>
            No valid slots ready to submit.
          </p>
        ) : (
          <ul
            style={{
              margin: '0 0 16px',
              maxHeight: '220px',
              overflowY: 'auto',
              border: '1px solid #e5e7eb',
              borderRadius: '6px',
              padding: '10px 10px 10px 28px',
            }}
          >
            {validItems.map((item, idx) => (
              <li key={idx} style={{ marginBottom: '8px', fontSize: '14px' }}>
                <strong>{item.label}</strong>{' '}
                <span style={{ color: '#4b5563' }}>
                  ({item.payload.start_time} – {item.payload.end_time})
                </span>
                <div style={{ fontSize: '13px', color: '#1f2937', marginTop: '2px' }}>
                  Subject: <strong>{item.subjectName}</strong> · Teacher:{' '}
                  <strong>{item.teacherName}</strong>
                </div>
              </li>
            ))}
          </ul>
        )}

        {invalidItems.length > 0 && (
          <div
            style={{
              marginBottom: '16px',
              padding: '10px',
              backgroundColor: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: '6px',
              fontSize: '13px',
              color: '#991b1b',
            }}
          >
            <strong>Will be skipped ({invalidItems.length}):</strong>
            <ul style={{ margin: '6px 0 0', paddingLeft: '18px' }}>
              {invalidItems.map((inv, idx) => (
                <li key={idx} style={{ marginBottom: '6px' }}>
                  <div>
                    <strong>{inv.label}</strong> — <span>{inv.reason}</span>
                  </div>
                  <div style={{ color: '#7f1d1d', fontSize: '12px' }}>
                    Subject: <strong>{inv.subjectName || 'Missing Subject'}</strong> · Teacher:{' '}
                    <strong>{inv.teacherName || 'No Teacher'}</strong>
                  </div>
                </li>
              ))}
            </ul>
          </div>
        )}

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
          <button type="button" onClick={onCancel}>
            Cancel
          </button>
          <button
            type="button"
            disabled={validItems.length === 0}
            onClick={onConfirm}
          >
            Submit {validItems.length} Slot(s)
          </button>
        </div>
      </div>
    </div>
  );
}
