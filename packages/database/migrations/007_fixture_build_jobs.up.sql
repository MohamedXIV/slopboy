-- Fixture jobs are intentionally independent of player revisions and the web role.
CREATE TABLE public.fixture_build_jobs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  request_key uuid UNIQUE NOT NULL,
  fixture text NOT NULL CHECK (fixture = 'trusted-fixture-v1'),
  status text NOT NULL DEFAULT 'queued' CHECK (status IN ('queued','running','ready','failed')),
  attempts integer NOT NULL DEFAULT 0 CHECK (attempts BETWEEN 0 AND 3),
  queued_at timestamptz NOT NULL DEFAULT clock_timestamp(),
  lease uuid,
  lease_until timestamptz,
  artifact bytea CHECK (octet_length(artifact) BETWEEN 1 AND 65536),
  artifact_sha256 text GENERATED ALWAYS AS (encode(sha256(artifact),'hex')) STORED,
  error_code text CHECK (error_code IN ('CRASH','TIMEOUT','OUTPUT_LIMIT','LEASE_EXPIRED')),
  CHECK ((status='running' AND lease IS NOT NULL AND lease_until IS NOT NULL)
    OR (status<>'running' AND lease IS NULL AND lease_until IS NULL)),
  CHECK ((status='ready') = (artifact IS NOT NULL)),
  CHECK ((status='failed' AND error_code IS NOT NULL) OR (status='ready' AND error_code IS NULL)
    OR status IN ('queued','running'))
);

-- A claim also makes abandoned jobs eligible for another attempt. The lease
-- deadline and random token fence all late or duplicated worker completions.
CREATE FUNCTION public.claim_fixture_build_job()
RETURNS TABLE(id uuid, lease uuid) LANGUAGE plpgsql SET search_path = pg_catalog AS $$
BEGIN
  RETURN QUERY WITH candidate AS (
    SELECT j.id FROM public.fixture_build_jobs j
    WHERE j.status='queued' OR (j.status='running' AND j.lease_until<=clock_timestamp())
    ORDER BY j.queued_at,j.id LIMIT 1 FOR UPDATE SKIP LOCKED
  )
  UPDATE public.fixture_build_jobs j SET
    status=CASE WHEN j.attempts=3 THEN 'failed' ELSE 'running' END,
    error_code=CASE WHEN j.attempts=3 THEN 'LEASE_EXPIRED' ELSE j.error_code END,
    attempts=least(j.attempts+1,3),
    lease=CASE WHEN j.attempts<3 THEN gen_random_uuid() END,
    lease_until=CASE WHEN j.attempts<3 THEN clock_timestamp()+interval '30 seconds' END
  FROM candidate c WHERE j.id=c.id
  RETURNING j.id,j.lease;
END;
$$;
REVOKE ALL ON TABLE public.fixture_build_jobs FROM PUBLIC;
REVOKE ALL ON FUNCTION public.claim_fixture_build_job() FROM PUBLIC;
