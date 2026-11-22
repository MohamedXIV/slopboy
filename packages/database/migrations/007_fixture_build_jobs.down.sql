-- Stop the fixture worker before removing its queue. No player source is stored here.
DROP FUNCTION public.claim_fixture_build_job();
DROP TABLE public.fixture_build_jobs;
