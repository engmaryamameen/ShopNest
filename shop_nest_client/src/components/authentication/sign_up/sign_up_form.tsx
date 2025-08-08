import React from "react";
import FormHead from "../../common/form_head";
import Heading from "../../common/heading";
import InputField from "../../common/input_field";
import Button from "../../common/button";

interface SignUpFormProps {
  handleSubmit: (event: React.FormEvent<HTMLFormElement>) => void;
  handleChange: (e: React.ChangeEvent<HTMLInputElement>) => void;
  formData: { email: string; password: string };
}

const SignUpForm: React.FC<SignUpFormProps> = ({
  handleSubmit,
  handleChange,
  formData,
}) => {
  return (
    <div>
      <FormHead handleSubmit={handleSubmit}>
        <Heading heading="SignUp" />
        <InputField
          type="email"
          name="email"
          value={formData.email}
          placeholder="Email*"
          label="Email"
          onChange={handleChange}
        />
        <InputField
          type="password"
          name="password"
          value={formData.password}
          placeholder="Password*"
          label="Password"
          onChange={handleChange}
        />
        <Button value="Sign Up" />
      </FormHead>
    </div>
  );
};

export default SignUpForm;
