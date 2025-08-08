class JwtDenylist < ApplicationRecord
  include Devise::JWT::RevocationStrategies::Denylist
end
