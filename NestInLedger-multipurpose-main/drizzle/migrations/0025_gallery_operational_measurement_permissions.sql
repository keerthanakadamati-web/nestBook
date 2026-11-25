DROP TRIGGER mandatory_committee_approval ON public.gallery_storage_history;
DROP TRIGGER mandatory_committee_approval ON public.gallery_notifications;
COMMENT ON TABLE public.gallery_storage_history IS 'Operational measurements written only by permission-checked RPC; not administrative edits.';
COMMENT ON TABLE public.gallery_notifications IS 'Recipient-scoped operational alerts written by measurement RPC only; no client mutation grants.';