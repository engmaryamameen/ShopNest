Rails.application.config.middleware.insert_before 0, Rack::Cors do
  allow do
    origins '*' # Change this to your frontend URL in production
    resource '*',
      headers: :any,
      expose: ['Authorization'],
      methods: [:get, :post, :put, :patch, :delete, :options, :head]
  end
end
