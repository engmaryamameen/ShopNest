import React, { useEffect } from "react";
import { useDispatch, useSelector } from "react-redux";
import { RootState } from "../redux/store";
import { clearAuth, setAuth } from "../redux/slices/auth";
import { Link } from "react-router-dom";
import Heading from "../components/common/heading";

const Navbar:React.FC = () => {
  const dispatch = useDispatch();
  useEffect(() => {
    const savedUser = localStorage.getItem("user");
    if (savedUser) {
      const parsedUser = JSON.parse(savedUser);
      dispatch(setAuth(parsedUser));
    }
  }, [dispatch]);
  const { token, user } = useSelector((state: RootState) => state.auth);
  const handleLogout = () => {
    dispatch(clearAuth());
    localStorage.removeItem("user");
  };
  return (
    <div className="flex items-center justify-between px-9 py-3">
      <div>
        <Heading heading="Shop Nest" />
      </div>
      <div>
        {token ? (
          <div className="flex items-center justify-between ">
            <div className="mr-10">
              <p>Welcome, {user.email}</p>
            </div>
            <div className="flex items-center justify-between space-x-2">
              <Link to={"/"}>Products</Link>
              <Link to={"/products/create"}>Add Product</Link>
              <button
                onClick={handleLogout}
                className="p-2 text-red-500  rounded"
              >
                Logout
              </button>
            </div>
          </div>
        ) : (
          <div className="space-x-2">
            <Link to={"/"}>Products</Link>
            <Link to={"/auth/login"}>Login</Link>
            <Link to={"/auth/sign_up"}>Sign Up</Link>
          </div>
        )}
      </div>
    </div>
  );
};

export default Navbar;
