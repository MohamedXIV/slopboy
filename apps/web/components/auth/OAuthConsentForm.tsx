'use client';
import {useEffect,useState} from 'react';
import {Alert,Button,Card,Chip} from '@heroui/react';
import {authClient} from '../../lib/auth/client';

type PublicClient={client_name?:string|null};

/** The SDK forwards Neon's signed query; never construct OAuth redirect URLs here. */
export default function OAuthConsentForm({clientId,requestedScope}:{clientId:string;requestedScope:string}){
  const [client,setClient]=useState<PublicClient|null>(null);
  const [loading,setLoading]=useState(true);
  const [submitting,setSubmitting]=useState(false);
  const [error,setError]=useState('');

  useEffect(()=>{
    let cancelled=false;
    authClient.oauth2.publicClient({query:{client_id:clientId}})
      .then(({data,error:clientError})=>{
        if(cancelled)return;
        if(clientError||!data)throw clientError??new Error('Unknown OAuth client');
        setClient(data);
      })
      .catch(()=>{if(!cancelled)setError('Could not verify this OAuth client. Restart the connection from the app.');})
      .finally(()=>{if(!cancelled)setLoading(false);});
    return ()=>{cancelled=true;};
  },[clientId]);

  async function decide(accept:boolean){
    if(!client||submitting)return;
    setSubmitting(true);setError('');
    try{
      const result=await authClient.oauth2.consent({accept});
      if(result.error)throw result.error;
      // On success the Neon Auth SDK handles the callback redirect itself.
    }catch{
      setError('Authorization could not be completed. Please restart Connect in ChatGPT or Claude.');
    }finally{setSubmitting(false);}
  }

  return <Card>
    <Card.Header>
      <Chip variant="soft" color="accent">SLOPBOY · DEV ONLY</Chip>
      <Card.Title>Authorize a read-only connection</Card.Title>
      <Card.Description>
        {loading?'Verifying the requesting app…':client?
          `${client.client_name||'This application'} is asking to connect to your Slopboy account.`:
          'Unable to load this authorization request.'}
      </Card.Description>
    </Card.Header>
    <Card.Content className="flex flex-col gap-3">
      <p className="text-sm">Requested access:</p>
      <ul className="list-disc pl-5 text-sm">
        {requestedScope.split(/\s+/).filter(Boolean).map(value=><li key={value}>{value}</li>)}
      </ul>
      <p className="text-sm">The dev MCP connector can read your Slopboy account ID. It cannot create, change, or delete games.</p>
      {error&&<Alert status="danger"><Alert.Indicator/><Alert.Content>
        <Alert.Title>Authorization failed</Alert.Title><Alert.Description>{error}</Alert.Description>
      </Alert.Content></Alert>}
    </Card.Content>
    <Card.Footer className="flex gap-3">
      <Button variant="primary" isDisabled={!client||loading||submitting} isPending={submitting}
        onPress={()=>void decide(true)}>Allow read-only access</Button>
      <Button variant="secondary" isDisabled={!client||loading||submitting}
        onPress={()=>void decide(false)}>Deny</Button>
    </Card.Footer>
  </Card>;
}
