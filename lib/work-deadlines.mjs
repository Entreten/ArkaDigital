export function futureDeadline(value,now=Date.now()){
 if(typeof value!=='string'||!/(?:Z|[+-]\d{2}:\d{2})$/.test(value))throw Error('Indica fecha y hora máximas de entrega.');
 const time=Date.parse(value);
 if(!Number.isFinite(time)||time<=now)throw Error('La fecha máxima debe ser posterior a la hora actual.');
 return new Date(time).toISOString();
}
