-- Workspace bot name and wake phrases live in bot_preferences (user_id null).
-- bot_name: 1-32 cased letters (lower <> upper, so Vietnamese works), spaces, hyphen, or apostrophe.
-- wake_phrases: a JSON array of 1-5 unique phrases, each 2-40 characters.
-- A phrase must also contain the bot name. That check stays in the app,
-- because it reads the sibling bot_name row.
-- These keys cannot be a member's own row, so a user preference cannot rename the bot.

create or replace function private.bot_name_text_ok(value text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  cleaned text := btrim(value);
  i int;
  ch text;
  letters int := 0;
begin
  if value is null or cleaned <> value then
    return false;
  end if;
  if char_length(cleaned) < 1 or char_length(cleaned) > 32 then
    return false;
  end if;
  if cleaned ~ '[[:space:]]{2}' then
    return false;
  end if;
  for i in 1..char_length(cleaned) loop
    ch := substr(cleaned, i, 1);
    if ch in (' ', '-', '''', '’') then
      continue;
    end if;
    if lower(ch) = upper(ch) then
      return false;
    end if;
    letters := letters + 1;
  end loop;
  if letters < 1 then
    return false;
  end if;
  if lower(substr(cleaned, 1, 1)) = upper(substr(cleaned, 1, 1)) then
    return false;
  end if;
  return true;
end
$$;

create or replace function private.wake_phrases_text_ok(value text)
returns boolean
language plpgsql
immutable
set search_path = ''
as $$
declare
  arr jsonb;
  elem jsonb;
  phrase text;
  seen text[] := array[]::text[];
  n int := 0;
  i int;
begin
  if value is null or btrim(value) = '' then
    return false;
  end if;
  begin
    arr := value::jsonb;
  exception when others then
    return false;
  end;
  if jsonb_typeof(arr) is distinct from 'array' then
    return false;
  end if;
  if jsonb_array_length(arr) < 1 or jsonb_array_length(arr) > 5 then
    return false;
  end if;
  for i in 0..jsonb_array_length(arr) - 1 loop
    elem := arr -> i;
    if jsonb_typeof(elem) is distinct from 'string' then
      return false;
    end if;
    phrase := elem #>> '{}';
    if phrase is null or btrim(phrase) <> phrase or char_length(phrase) < 2 or char_length(phrase) > 40 then
      return false;
    end if;
    if lower(phrase) = any (seen) then
      return false;
    end if;
    seen := array_append(seen, lower(phrase));
    n := n + 1;
  end loop;
  return n >= 1 and n <= 5;
end
$$;

revoke all on function private.bot_name_text_ok(text), private.wake_phrases_text_ok(text) from public, anon;
grant execute on function private.bot_name_text_ok(text), private.wake_phrases_text_ok(text) to authenticated, service_role;

alter table public.bot_preferences
  add constraint bot_preferences_bot_name_value check (
    pref_key <> 'bot_name'
    or (user_id is null and private.bot_name_text_ok(pref_value))
  );

alter table public.bot_preferences
  add constraint bot_preferences_wake_phrases_value check (
    pref_key <> 'wake_phrases'
    or (user_id is null and private.wake_phrases_text_ok(pref_value))
  );
