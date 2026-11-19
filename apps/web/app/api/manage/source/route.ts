import {submitPrivateSource} from '../../../../server/private-source-request';
export const runtime = 'nodejs';
export function POST(request: Request) {
  return submitPrivateSource(request, null);
}
