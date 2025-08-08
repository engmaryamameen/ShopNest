import axios from "axios";

const API_URL = "http://localhost:3000";

export const register = async (email: string, password: string) => {
  return axios.post(`${API_URL}/users`, { user: { email, password } });
};

export const login = async (email: string, password: string) => {
  return axios.post(`${API_URL}/users/sign_in`, {
    user: { email, password },
  });
};

export const getProducts = async () => {
  const response = await axios.get(`${API_URL}/products`);
  return response.data;
};
export const getProduct = async (id: number) => {
  const response = await axios.get(`${API_URL}/products/${id}`);
  return response.data;
};

export const createProduct = async (product: any) => {
  const response = await axios.post(`${API_URL}/products`, { product });
  return response.data;
};

export const deleteProduct = async (id: number) => {
  await axios.delete(`${API_URL}/products/${id}`);
};

export const updateProduct = async (id: number, product: any) => {
  const response = await axios.patch(`${API_URL}/products/${id}`, { product });
  return response.data;
};
