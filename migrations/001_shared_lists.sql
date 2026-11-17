BEGIN;

CREATE TABLE app_users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  issuer text NOT NULL,
  subject text NOT NULL,
  display_name text NOT NULL,
  UNIQUE (issuer, subject)
);

CREATE TABLE shopping_groups (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  owner_id uuid NOT NULL REFERENCES app_users(id),
  imported_id uuid,
  UNIQUE (owner_id, imported_id),
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE app_sessions (
  token_hash text PRIMARY KEY,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL
);

CREATE TABLE group_members (
  group_id uuid NOT NULL REFERENCES shopping_groups(id) ON DELETE CASCADE,
  user_id uuid NOT NULL REFERENCES app_users(id) ON DELETE CASCADE,
  PRIMARY KEY (group_id, user_id)
);

CREATE INDEX group_members_user_idx ON group_members (user_id);

CREATE TABLE shopping_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  group_id uuid NOT NULL REFERENCES shopping_groups(id) ON DELETE CASCADE,
  name text NOT NULL CHECK (char_length(btrim(name)) BETWEEN 1 AND 100),
  needed boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX shopping_items_group_idx ON shopping_items (group_id);

CREATE TABLE group_invitations (
  token_hash text PRIMARY KEY,
  group_id uuid NOT NULL REFERENCES shopping_groups(id) ON DELETE CASCADE,
  expires_at timestamptz NOT NULL,
  redeemed_at timestamptz,
  revoked_at timestamptz
);

CREATE INDEX group_invitations_group_idx ON group_invitations (group_id);

COMMIT;
