import { BrowserRouter, Route, Routes } from "react-router-dom";
import "./App.css";
import { Login, SignUp } from "./pages/authentication";
import ProductList from "./pages/products/fetch_products";
import CreateProduct from "./pages/products/create_product";
import UpdateProduct from "./pages/products/update_product";
import Navbar from "./layout/main_bar";

function App() {
  return (
    <>
      <BrowserRouter>
        <Navbar />
        <Routes>
          <Route path="/auth/login" element={<Login />} />
          <Route path="/auth/sign_up" element={<SignUp />} />
          <Route path="/" element={<ProductList />} />
          <Route path="/products/create" element={<CreateProduct />} />
          <Route path="/products/update/:id" element={<UpdateProduct />} />
        </Routes>
      </BrowserRouter>
    </>
  );
}

export default App;
