import React, { useState } from "react";
import { createProduct } from "../../api";
import InputField from "../../components/common/input_field";
import FormHead from "../../components/common/form_head";
import Heading from "../../components/common/heading";
import Button from "../../components/common/button";
import { useNavigate } from "react-router-dom";

const CreateProduct: React.FC = () => {
  const [formData, setFormData] = useState({
    name: "",
    description: "",
    price: "0.0",
    stock_quantity: "0.0",
    category: "",
    image_url: "",
  });
  const navigate = useNavigate();
  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const newProduct = await createProduct(formData);
    console.log("Created Product:", newProduct);
    setTimeout(() => {
      navigate("/auth/login");
    }, 3000);
  };

  return (
    <div className="lg:w-1/2 sm:w-2/3 mt-10 sm:mx-auto mx-10 border-gray-500 py-10 rounded-xs lg:mx-auto px-9">
      <FormHead handleSubmit={handleSubmit}>
        <Heading heading="Create New Product" />
        <InputField
          type="text"
          label="Product Name*"
          name="name"
          value={formData.name}
          onChange={handleChange}
          placeholder="Product Name"
        />
        <InputField
          type="text"
          name="description"
          label="Product Description"
          value={formData.description}
          onChange={handleChange}
          placeholder="Product Description"
        />
        <InputField
          type="number"
          name="price"
          label="Enter Product Price"
          value={formData.price}
          onChange={handleChange}
          placeholder="Price"
        />
        <InputField
          type="number"
          name="stock_quantity"
          label="Stock Quantity"
          value={formData.stock_quantity}
          onChange={handleChange}
          placeholder="Stock Quantity"
        />
        <InputField
          type="text"
          label="Category"
          name="category"
          value={formData.category}
          onChange={handleChange}
          placeholder="Category"
        />
        <InputField
          label="Image"
          type="file"
          name="image_url"
          value={formData.image_url}
          onChange={handleChange}
          placeholder="Image URL"
        />
        <Button value="Create Product" />
      </FormHead>
    </div>
  );
};

export default CreateProduct;
