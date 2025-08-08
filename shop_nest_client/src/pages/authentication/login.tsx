import React, { useEffect, useState } from "react";
import { useDispatch, useSelector } from "react-redux";
import { setAuth } from "../../redux/slices/auth";
import { LoginForm } from "../../components/authentication";
import { login } from "../../api";
import { RootState } from "../../redux/store";
import { useNavigate } from "react-router-dom";

const Login: React.FC = () => {
  const [formData, setFormData] = useState({ email: "", password: "" });
  const dispatch = useDispatch();
  const navigate = useNavigate();
  const { token } = useSelector((state: RootState) => state.auth);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const res = await login(formData.email, formData.password);
      console.log("Logged in:", res.data);
      const authData = {
        token: res.data.token,
        user: { email: res.data.user.email, id: res.data.user.id },
      };
      localStorage.setItem("user", JSON.stringify(authData));
      dispatch(setAuth(authData));
      setTimeout(() => {
        navigate("/");
      }, 3000);
    } catch (error) {
      if (error instanceof Error) {
        console.error("Login error:", error.message);
      } else {
        console.error("An unknown error occurred");
      }
    }
  };
  useEffect(() => {
    if (token) {
      navigate("/");
    }
  }, [token, navigate]);
  return (
    <div className="lg:w-1/2 sm:w-2/3 mt-10 sm:mx-auto mx-10 border-gray-500 py-10 rounded-xs lg:mx-auto px-9">
      <div className="mb-6">
        <p className="text-center font-semibold text-2xl">Shop Nest</p>
        <p className="text-sm opacity-80 text-center mt-1">
          Welcome back! Login to your account
        </p>
      </div>
      <LoginForm
        handleSubmit={handleSubmit}
        handleChange={handleChange}
        formData={formData}
      />
    </div>
  );
};

export default Login;
