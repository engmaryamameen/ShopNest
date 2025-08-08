import React, { useState } from "react";
import FormHead from "../../common/form_head";
import InputField from "../../common/input_field";
import Button from "../../common/button";
import Heading from "../../common/heading";

interface LoginFormProps {
  handleSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  formData: { email: string; password: string };
}

const LoginForm: React.FC<LoginFormProps> = ({
  handleSubmit,
  handleChange,
  formData,
}) => {
  const [showPassword, setShowPassword] = useState(false);

  return (
    <div>
      <FormHead handleSubmit={handleSubmit}>
        <Heading heading="Login" />

        {/* Email Field */}
        <InputField
          type="email"
          name="email"
          value={formData.email}
          placeholder="Email*"
          label="Email"
          onChange={handleChange}
        />

        {/* Password Field with Show/Hide Toggle */}
        <div className="relative">
          <InputField
            type={showPassword ? "text" : "password"}
            name="password"
            value={formData.password}
            placeholder="Password*"
            label="Password"
            onChange={handleChange}
          />
          <button
            type="button"
            className="absolute inset-y-0 right-3 flex items-center text-gray-500"
            onClick={() => setShowPassword(!showPassword)}
          >
            {showPassword ? "🙈 Hide" : "👁 Show"}
          </button>
        </div>

        <Button value="Login" />
      </FormHead>
    </div>
  );
};

export default LoginForm;
