export const registrationRoles=[['Farmer','Farmer'],['Buyer','Buyer'],['Transporter','Transporter'],['Agronomist','Adviser / agronomist'],['Chemical Representative','Agent / chemical representative']] as const;
export function validateRegistration(input:{name:string;phone:string;company:string;email:string;password:string;confirmation:string;role:string}){
 if(!registrationRoles.some(([key])=>key===input.role))return 'Choose an account type.';
 if(input.name.trim().length<2)return 'Enter your name.';
 if(input.phone.replace(/\D/g,'').length<7||input.phone.replace(/\D/g,'').length>15)return 'Enter a valid contact number, including the country code where possible.';
 if(input.company.trim().length<2)return 'Enter your company or farm business name.';
 if(!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(input.email.trim()))return 'Enter a valid email address.';
 if(input.password.length<8)return 'Choose a password of at least 8 characters.';
 if(input.password!==input.confirmation)return 'The passwords do not match.';
 return '';
}
