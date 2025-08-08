import React, { useEffect, useState } from "react";
import { SignUpForm } from "../../components/authentication";
import { register } from "../../api";
import { useNavigate } from "react-router-dom";
import { useSelector } from "react-redux";
import { RootState } from "../../redux/store";

const SignUp: React.FC = () => {
  const [formData, setFormData] = useState({ email: "", password: "" });
  const navigate = useNavigate();
  const { token } = useSelector((state: RootState) => state.auth);
  useEffect(() => {
    if (token) {
      navigate("/");
    }
  }, [token, navigate]);
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };
  const handleSubmit = async () => {
    try {
      const res = await register(formData.email, formData.password);
      console.log("Registered:", res.data);
      setTimeout(() => {
        navigate("/auth/login");
      }, 3000);
    } catch (error: unknown) {
      if (error instanceof Error) {
        console.error("Registration error:", error.message);
      } else {
        console.error("An unknown error occurred");
      }
    }
  };
  return (
    <div className="lg:w-1/2 sm:w-2/3 mt-10 sm:mx-auto mx-10 border-gray-500 py-10 rounded-xs lg:mx-auto px-9">
      <div className="mb-6">
        <p className="text-center font-semibold text-2xl">Shop Nest</p>
        <p className="text-sm opacity-80 text-center mt-1">
          Create your account to enjoy more features.
        </p>
      </div>
      <SignUpForm
        handleSubmit={handleSubmit}
        handleChange={handleChange}
        formData={formData}
      />
    </div>
  );
};

export default SignUp;
