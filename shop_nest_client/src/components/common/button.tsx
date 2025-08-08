import React from "react";

interface buttonProps {
  value: string;
}

const Button: React.FC<buttonProps> = ({ value }) => {
  return <button className=" my-3 py-2  w-full bg-blue-700 text-white font-semibold text-lg uppercase cursor-pointer" type="submit">{value}</button>;
};

export default Button;
