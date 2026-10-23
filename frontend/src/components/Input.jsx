export default function Input({
  label, value, onChange, type = 'text', placeholder, error,
  disabled, max, min, name, className = '',
}) {
  return (
    <div className={className}>
      {label && <label className="label">{label}</label>}
      <input
        name={name}
        type={type}
        value={value}
        onChange={onChange}
        placeholder={placeholder}
        disabled={disabled}
        max={max}
        min={min}
        className={`input ${error ? 'border-red-400' : ''}`}
      />
      {error && <div className="text-xs text-red-500 mt-1">{error}</div>}
    </div>
  );
}
