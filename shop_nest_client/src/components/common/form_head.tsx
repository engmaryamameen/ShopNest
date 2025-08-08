import React from "react";

interface FormHeadProps {
  handleSubmit: (e: React.FormEvent<HTMLFormElement>) => void;
  children: React.ReactNode;
}

const FormHead: React.FC<FormHeadProps> = ({ handleSubmit, children }) => {
  return <form onSubmit={handleSubmit}>{children}</form>;
};

export default FormHead;
