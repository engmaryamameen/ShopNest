import axios from "axios";

const axiosInstance = axios.create({
  baseURL: "http://localhost:3000", 
  headers: {
    "Content-Type": "application/json",
  },
});

const csrfToken = document.querySelector('meta[name="csrf-token"]')?.getAttribute('content');

if (csrfToken) {
  axiosInstance.defaults.headers['X-CSRF-Token'] = csrfToken;
}

export default axiosInstance;
