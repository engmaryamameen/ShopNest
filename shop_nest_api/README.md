# Rails Authentication System

A full-stack application built with a **Ruby on Rails backend** using **Devise for authentication** and **PostgreSQL** as the database. This project implements CRUD operations with standard RESTful routes for managing users.

---

## **Features**
- User authentication (sign up, login, logout) using Devise.
- Secure password storage with bcrypt.
- Product management CRUD operations.
- PostgreSQL as the database.
- RESTful API for user-related services.

---

## **Directory Structure**

```
.
├──  Backend API (Ruby on Rails)               
│   ├── app 
│   │   ├── controllers          # API route controllers (user, sessions) 
│   │   ├── models               # User model (with Devise authentication)
│   │   ├── views     
│   ├── config             # Configuration files (routes, Devise, database)
│   │   ├── database.yml   # PostgreSQL database configuration
│   │   ├── routes.rb      # API routes
│   ├── db                       # Database migrations and schema
│   │   ├── migrate         # Database migration files 
│   ├── Gemfile                  # Ruby gems and dependencies 
```

---


## **Setup Instructions**

### **1. Prerequisites**
- Ruby (version >= 3.x)
- Rails (version >= 7.x)
- PostgreSQL installed 

### **2. Clone the Repository**
```bash
https://github.com/maryamameen34/shop_nest_api.git
cd shop_nest_api

```

---

### **3.  Install Dependencies**
Install Ruby gems:
```bash
bundle install

```

---
### **4.  Configure Database**

- Create the PostgreSQL database:
```bash
rails db:create

```
- Run migrations to set up your tables:
```bash
rails db:migrate

```


### **5. Set Up Environment Variables**
- config/database.yml should already be set to use PostgreSQL.

### **6. Run the Application**
Start the Rails server:
```bash
rails server

```
## **API Endpoints**

### **Authentication**
- **POST** `/auth/register` - Register a new user.  
  Registers a new user with email and password.

- **POST** `/auth/login` - Log in and retrieve a session or token (Devise).  
  Logs in the user and returns a session or token for authentication.

- **DELETE** `/auth/logout` - Log out the current user.  
  Logs the user out by invalidating the session or JWT.

### **User Management (CRUD)**
- **GET** `/users` - Retrieve all users.  
  Retrieves a list of all users in the system.

- **GET** `/users/:id` - Retrieve a specific user by ID.  
  Retrieves the details of a user by their unique ID.

- **PATCH** `/users/:id` - Update a user’s information.  
  Updates the specified user's details (e.g., email, password).

- **DELETE** `/users/:id` - Delete a user by ID.  
  Deletes the user from the system by their unique ID.

---

## **Tech Stack**

### **Backend**
- **Ruby on Rails** (version >= 7.x)
- **PostgreSQL** for the database
- **Devise** for user authentication
- **JWT or Sessions** for secure login (based on your implementation)

## **Testing**
Using  **RSpec**   for testing your models, controllers, and features.  
command to run tests:

```bash
rspec
```

## **Frontend Repository**
The frontend for this project can be found at the following repository:

[Frontend Repository - shop_nest_frontend](https://github.com/maryamameen34/shop_nest_frontend.git)

---

Feel free to check out the frontend code, contribute, or use it alongside the backend API.

