import React, { useEffect, useState } from "react";
import { deleteProduct, getProducts } from "../../api";
import { Link } from "react-router-dom";
import { CiEdit } from "react-icons/ci";
import { MdDelete } from "react-icons/md";

const ProductList: React.FC = () => {
  const [products, setProducts] = useState<any[]>([]);

  useEffect(() => {
    const fetchProducts = async () => {
      const products = await getProducts();
      setProducts(products);
    };

    fetchProducts();
  }, []);
  const handleDelete = async (id: number) => {
    const confirmDelete = window.confirm("Are you sure you want to delete this product?");
    if (confirmDelete) {
      await deleteProduct(id);
      setProducts(products.filter((product) => product.id !== id));
      console.log("Product deleted");
    }
  };  
  return (
    <div className="max-w-7xl mx-auto p-6">
      <h2 className="text-3xl font-semibold text-gray-800 mb-8 text-center">
        Product List
      </h2>
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">
        {products.map((product) => (
          <div
            key={product.id}
            className="bg-white border border-gray-200 rounded-lg shadow-lg p-4 transition-transform transform hover:scale-105"
          >
            {/* <img
              src={product.image_url}
              alt={product.name}
              className="w-full h-56 object-cover rounded-md mb-4"
            /> */}
            <div className="space-y-2">
              <h3 className="text-xl font-semibold text-gray-800">
                {product.name}
              </h3>
              <p className="text-gray-600 text-sm">{product.description}</p>
              <div className="flex justify-between items-center text-gray-700">
                <span className="font-semibold">Price: ${product.price}</span>
                <span className="text-sm">Stock: {product.stock_quantity}</span>
              </div>
              <div className="mt-2">
                <span className="text-sm text-indigo-500">
                  {product.category}
                </span>
              </div>
            </div>
            <div className="flex items-center justify-between mt-4">
              <Link to={`/products/update/${product.id}`} className="text-xl ">
                <CiEdit />
              </Link>
              <Link to={``} onClick={(e) => handleDelete(product.id)}>
                <MdDelete />
              </Link>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};

export default ProductList;
