import nodemailer from "nodemailer";

function config() {
  return {
    connectionTimeout: 10000,
    greetingTimeout: 10000,
    socketTimeout: 15000,
    host: process.env.EMAIL_HOST || process.env.SMTP_HOST,
    port: Number(process.env.EMAIL_PORT || process.env.SMTP_PORT || 587),
    secure: (process.env.EMAIL_SECURE || process.env.SMTP_SECURE) === "true",
    auth: {
      user: process.env.EMAIL_USER || process.env.SMTP_USER,
      pass: process.env.EMAIL_PASSWORD || process.env.SMTP_PASS,
    },
  };
}
export function validateEmailConfig() {
  const options = config();
  if (
    !options.host ||
    !options.auth.user ||
    !options.auth.pass ||
    !process.env.EMAIL_FROM
  ) {
    throw new Error(
      "Configure EMAIL_HOST, EMAIL_USER, EMAIL_PASSWORD and EMAIL_FROM",
    );
  }
}
async function sendMail(message) {
  const options = config();
  if (!options.host || !options.auth.user || !options.auth.pass) {
    if (process.env.NODE_ENV === "production") validateEmailConfig();
    console.info("Fussy Panda development email:", message);
    return;
  }
  await nodemailer.createTransport(options).sendMail({
    from: process.env.EMAIL_FROM || "Fussy Panda <no-reply@fussypanda.local>",
    ...message,
  });
}
export function sendPasswordResetEmail({ to, resetUrl }) {
  return sendMail({
    to,
    subject: "Reset your Fussy Panda password",
    text: `Reset your Fussy Panda password: ${resetUrl}\nThis link expires in one hour. If you did not request it, you can ignore this email.`,
  });
}
export function sendWelcomeEmail({ to }) {
  return sendMail({
    to,
    subject: "Welcome to Fussy Panda",
    text: "Welcome to Fussy Panda! Your account is ready.",
  });
}

export function sendSignupNotification({ user }) {
  const to = process.env.SIGNUP_NOTIFICATION_EMAIL;
  if (!to) return Promise.resolve();
  return sendMail({
    to,
    subject: "New Fussy Panda signup",
    text: [
      "A new Fussy Panda account has been created.",
      `Email: ${user.email}`,
      `Name: ${user.ownerName || "Not supplied"}`,
      `Signup method: ${user.authProvider === "google" ? "Google" : "Email and password"}`,
      `Signup time: ${new Date(user.createdAt).toISOString()}`,
    ].join("\n"),
  });
}

// Call only after the new account transaction commits. Each delivery is independent.
export async function sendAccountCreatedEmails(user) {
  const results = await Promise.allSettled([
    Promise.resolve().then(() => sendWelcomeEmail({ to: user.email })),
    Promise.resolve().then(() => sendSignupNotification({ user })),
  ]);
  results.forEach((result, index) => {
    if (result.status === "rejected") {
      console.error(`Fussy Panda ${index === 0 ? "welcome" : "signup notification"} email could not be sent`);
    }
  });
}
