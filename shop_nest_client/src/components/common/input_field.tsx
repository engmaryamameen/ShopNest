import React from "react";

interface InputFieldProps {
  type: string;
  name: string;
  value: string;
  label: string;
  placeholder: string;
  onChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
}

const InputField: React.FC<InputFieldProps> = ({
  type,
  name,
  value,
  placeholder,
  label,
  onChange,
}) => {
  return (
    <div className="">
      <label
        htmlFor={name}
        className="block text-base font-semibold text-gray-700 mb-0.5"
      >
        {label}
      </label>
      <input
        type={type}
        name={name}
        value={value}
        placeholder={placeholder}
        onChange={onChange}
        className="w-full py-1 focus:outline-none border-t-none border-b border-gray-400   mb-2"
      />
    </div>
  );
};

export default InputField;
