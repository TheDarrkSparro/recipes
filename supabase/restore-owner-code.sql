-- The Dark Sparrow Eats: switch the owner code back on
-- Only needed if you want the old owner code to work again alongside (or
-- instead of) contributor accounts. Run it in Supabase's SQL Editor.
-- Running add-accounts.sql again switches the code off again.

do $$
declare
  f text;
begin
  foreach f in array array[
    'public.add_recipe(text, jsonb)',
    'public.update_recipe(text, text, jsonb)',
    'public.photo_upload_ticket(text)',
    'public.photo_read_ticket(text)'
  ] loop
    if to_regprocedure(f) is not null then
      execute 'grant execute on function ' || f || ' to anon, authenticated';
    end if;
  end loop;
end;
$$;
