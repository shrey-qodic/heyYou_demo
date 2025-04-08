const otpLoginAdminTemplate = (OTP) => {
  return `
    <!DOCTYPE html>
    <html lang="en">
    <head>
        <meta charset="UTF-8">
        <meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Verification Code</title>
    </head>
    <body style="font-family: Arial, sans-serif;">
    
        <div style="max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #ddd; border-radius: 10px; background-color: #f9f9f9;">
        <h2 style="text-align: center; color: #333;">Verification Code</h2>
                
        <p>Your OTP code for verification is: <strong>${OTP}</strong></p>
        
        <p>If you didn't request this verification, please ignore this email.</p>
        
        <p>Best regards,<br>
        Heyou.io</p>
        </div>
    
    </body>
    </html>  
`;
};

export default otpLoginAdminTemplate;
