"use client";

import { useState, useRef, useEffect } from "react";

interface EditableSelectProps {
  value: string;
  options: { value: string; label: string; className?: string }[];
  onSave: (value: string) => Promise<void>;
  disabled?: boolean;
  className?: string;
  renderValue?: (value: string) => React.ReactNode;
}

export function EditableSelect({
  value,
  options,
  onSave,
  disabled = false,
  className = "",
  renderValue,
}: EditableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    }
    if (isOpen) {
      document.addEventListener("mousedown", handleClickOutside);
      return () => document.removeEventListener("mousedown", handleClickOutside);
    }
  }, [isOpen]);

  async function handleSelect(newValue: string) {
    if (newValue === value || saving) return;
    
    setSaving(true);
    setIsOpen(false);
    try {
      await onSave(newValue);
    } finally {
      setSaving(false);
    }
  }

  const currentOption = options.find(o => o.value === value);

  return (
    <div className="relative inline-block" ref={dropdownRef}>
      <button
        type="button"
        onClick={() => !disabled && !saving && setIsOpen(!isOpen)}
        disabled={disabled || saving}
        className={`${className} ${!disabled && !saving ? "cursor-pointer hover:ring-2 hover:ring-blue-300 hover:ring-offset-1" : ""} ${saving ? "opacity-50" : ""} transition-all`}
        title={disabled ? undefined : "Click to edit"}
      >
        {renderValue ? renderValue(value) : currentOption?.label || value}
        {saving && <span className="ml-1 text-xs">...</span>}
      </button>

      {isOpen && (
        <div className="absolute left-0 top-full z-50 mt-1 min-w-[120px] rounded-lg border border-slate-200 bg-white py-1 shadow-lg">
          {options.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => handleSelect(option.value)}
              className={`w-full px-3 py-1.5 text-left text-sm hover:bg-slate-50 ${
                option.value === value ? "bg-slate-100 font-medium" : ""
              }`}
            >
              <span className={option.className}>{option.label}</span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

interface EditableTextProps {
  value: string | null | undefined;
  placeholder?: string;
  onSave: (value: string | null) => Promise<void>;
  disabled?: boolean;
  className?: string;
}

export function EditableText({
  value,
  placeholder = "Click to set",
  onSave,
  disabled = false,
  className = "",
}: EditableTextProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(value || "");
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  async function handleSave() {
    const newValue = editValue.trim() || null;
    if (newValue === (value || null)) {
      setIsEditing(false);
      return;
    }

    setSaving(true);
    try {
      await onSave(newValue);
      setIsEditing(false);
    } finally {
      setSaving(false);
    }
  }

  function handleKeyDown(e: React.KeyboardEvent) {
    if (e.key === "Enter") {
      handleSave();
    } else if (e.key === "Escape") {
      setEditValue(value || "");
      setIsEditing(false);
    }
  }

  if (isEditing) {
    return (
      <input
        ref={inputRef}
        type="text"
        value={editValue}
        onChange={(e) => setEditValue(e.target.value)}
        onBlur={handleSave}
        onKeyDown={handleKeyDown}
        disabled={saving}
        className={`rounded border border-blue-300 px-2 py-0.5 text-sm outline-none ring-2 ring-blue-200 ${saving ? "opacity-50" : ""}`}
        placeholder={placeholder}
      />
    );
  }

  return (
    <button
      type="button"
      onClick={() => !disabled && setIsEditing(true)}
      disabled={disabled}
      className={`${className} ${!disabled ? "cursor-pointer hover:bg-slate-100" : ""} rounded px-1 py-0.5 text-left transition-colors`}
      title={disabled ? undefined : "Click to edit"}
    >
      {value || <span className="italic text-slate-400">{placeholder}</span>}
    </button>
  );
}
