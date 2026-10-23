import Modal from './Modal';
import Button from './Button';

export default function ConfirmDelete({ open, onClose, onConfirm, title = 'Delete?', message }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Cancel</Button>
          <Button variant="danger" onClick={onConfirm}>Delete</Button>
        </>
      }
    >
      <p className="text-sm text-slate-600 dark:text-slate-300">{message || 'This action cannot be undone.'}</p>
    </Modal>
  );
}
