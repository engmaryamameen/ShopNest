import React, { useState, useEffect } from "react";
import { useNavigate, useParams } from "react-router-dom";
import { getProduct, updateProduct } from "../../api";
import FormHead from "../../components/common/form_head";
import InputField from "../../components/common/input_field";
import Button from "../../components/common/button";
import Heading from "../../components/common/heading";
import { ProductTypes } from "../../types/product";

const UpdateProduct: React.FC = () => {
  const { id } = useParams<{ id: string }>();
  const navigate = useNavigate();
  const [formData, setFormData] = useState<ProductTypes>({
    name: "",
    description: "",
    price: "",
    stock_quantity: "",
    category: "",
    image_url: "",
  });

  useEffect(() => {
    const fetchProduct = async () => {
      const product = await getProduct(Number(id));
      setFormData(product);
    };

    fetchProduct();
  }, [id]);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    setFormData({ ...formData, [e.target.name]: e.target.value });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const updatedProduct = await updateProduct(Number(id), formData);
    console.log("Updated Product:", updatedProduct);
    setTimeout(() => {
      navigate("/auth/login");
    }, 3000);
  };

  return (
    <div className="lg:w-1/2 sm:w-2/3 mt-10 sm:mx-auto mx-10 border-gray-500 py-10 rounded-xs lg:mx-auto px-9 shadow">
      <Heading heading="Update Product" />
      <FormHead handleSubmit={handleSubmit}>
        <InputField
          type="text"
          label="Name"
          name="name"
          value={formData.name}
          onChange={handleChange}
          placeholder="Product Name"
        />
        <InputField
          name="description"
          label="Description"
          value={formData.description}
          onChange={handleChange}
          type="text"
          placeholder="Product Description"
        />
        <InputField
          type="number"
          name="price"
          label="Price"
          value={formData.price}
          onChange={handleChange}
          placeholder="Price"
        />
        <InputField
          label="Stock Quantity"
          type="number"
          name="stock_quantity"
          value={formData.stock_quantity}
          onChange={handleChange}
          placeholder="Stock Quantity"
        />
        <InputField
          type="text"
          name="category"
          label="Category"
          value={formData.category}
          onChange={handleChange}
          placeholder="Category"
        />
        <InputField
          label="Image Url"
          type="text"
          name="image_url"
          value={formData.image_url}
          onChange={handleChange}
          placeholder="Image URL"
        />
        <Button value="Update Product" />
      </FormHead>
    </div>
  );
};

export default UpdateProduct;
