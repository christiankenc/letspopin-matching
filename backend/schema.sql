-- 1) main table
CREATE TABLE IF NOT EXISTS profiles (
  id                CHAR(36) PRIMARY KEY, -- random UUID
  name              VARCHAR(255),
  url               VARCHAR(512) NOT NULL,
  headline          TEXT,
  about             LONGTEXT,
  followers         INT NULL,
  total_experience  INT NULL,
  completeness_score DOUBLE NULL,
  social_score       DOUBLE NULL,
  total_score        DOUBLE NULL,
  created_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
  updated_at        TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  UNIQUE KEY uniq_profiles_url (url)
  title_tags        JSON,
  company_tags        JSON,
  looking_tags        JSON,
  offering_tags        JSON,
  offering_vec        JSON,
  looking_vec        JSON,
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 2) education (1→many)
CREATE TABLE IF NOT EXISTS education (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  profile_id  CHAR(36) NOT NULL,
  title       VARCHAR(255),
  degree      VARCHAR(255),
  duration    VARCHAR(255),
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- 3) experience (1→many)
CREATE TABLE IF NOT EXISTS experience (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  profile_id  CHAR(36) NOT NULL,
  title       VARCHAR(255),
  company     VARCHAR(255),
  duration    VARCHAR(255),
  description LONGTEXT,
  FOREIGN KEY (profile_id) REFERENCES profiles(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
