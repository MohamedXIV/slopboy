import {isGameUuid} from '../../../../packages/catalog/src/index.ts';
export type ManagedDevice={deviceId:string;count:number;lastSavedAt:string};
export function parseManagedDevices(value:unknown):ManagedDevice[]{
  if(!Array.isArray(value)||value.length>100)throw Error('INVALID_DEVICE_LIST');
  const ids=new Set<string>();let total=0;
  return value.map(row=>{
    if(!row||typeof row!=='object'||typeof row.deviceId!=='string'||!isGameUuid(row.deviceId)||ids.has(row.deviceId)||
      !Number.isSafeInteger(row.count)||row.count<1||row.count>5||typeof row.lastSavedAt!=='string'||!Number.isFinite(Date.parse(row.lastSavedAt)))throw Error('INVALID_DEVICE_LIST');
    ids.add(row.deviceId);total+=row.count;if(total>100)throw Error('INVALID_DEVICE_LIST');
    return {deviceId:row.deviceId,count:row.count,lastSavedAt:row.lastSavedAt};
  });
}
