import test, { mock } from "node:test";
import assert from "node:assert/strict";

const deliveries = [];
let rejectWelcome = false;
let rejectAll = false;
mock.module("nodemailer", { defaultExport: {
  createTransport() {
    return { async sendMail(message) {
      deliveries.push(message);
      if (rejectAll || (rejectWelcome && message.subject === "Welcome to Fussy Panda")) throw new Error("Fixture delivery failure");
    } };
  },
} });
const { sendAccountCreatedEmails } = await import("../lib/email.js");

test("new account emails are independent and contain only intended account details", async t => {
  process.env.EMAIL_HOST = "smtp.example.com";
  process.env.EMAIL_USER = "fixture";
  process.env.EMAIL_PASSWORD = "fixture";
  process.env.EMAIL_FROM = "Fussy Panda <hello@example.com>";
  process.env.SIGNUP_NOTIFICATION_EMAIL = "owner@example.com";
  const user = {
    email: "customer@example.com", ownerName: "Customer", authProvider: "local",
    createdAt: new Date("2026-10-20T12:00:00Z"), password: "must-not-send",
    token: "must-not-send", tokenVersion: 123,
  };
  await t.test("welcome and owner notification use separate recipients", async () => {
    await sendAccountCreatedEmails(user);
    assert.equal(deliveries.length, 2);
    assert.equal(deliveries[0].to, user.email);
    assert.equal(deliveries[1].to, "owner@example.com");
    assert.match(deliveries[1].text, /Email and password/);
    assert.match(deliveries[1].text, /2026-10-20T12:00:00.000Z/);
    assert.doesNotMatch(JSON.stringify(deliveries), /must-not-send|tokenVersion/);
  });
  await t.test("Google notifications identify the signup method", async () => {
    deliveries.length = 0;
    await sendAccountCreatedEmails({ ...user, authProvider: "google" });
    assert.match(deliveries[1].text, /Signup method: Google/);
  });
  await t.test("an unset owner inbox disables only the owner notification", async () => {
    deliveries.length = 0;
    delete process.env.SIGNUP_NOTIFICATION_EMAIL;
    await sendAccountCreatedEmails(user);
    assert.equal(deliveries.length, 1);
  });
  await t.test("one failed delivery does not suppress the other or reject account creation", async () => {
    deliveries.length = 0;
    process.env.SIGNUP_NOTIFICATION_EMAIL = "owner@example.com";
    rejectWelcome = true;
    const log = mock.method(console, "error", () => {});
    await assert.doesNotReject(sendAccountCreatedEmails(user));
    assert.equal(deliveries.length, 2);
    assert.equal(log.mock.callCount(), 1);
    assert.equal(log.mock.calls[0].arguments[0], "Fussy Panda welcome email could not be sent");
    log.mock.restore(); rejectWelcome = false;
  });
  await t.test("total mail failure is contained without logging credentials or customer data", async () => {
    rejectAll = true;
    const log = mock.method(console, "error", () => {});
    await assert.doesNotReject(sendAccountCreatedEmails(user));
    assert.equal(log.mock.callCount(), 2);
    assert.doesNotMatch(JSON.stringify(log.mock.calls.map(call => call.arguments)), /customer@|fixture|must-not-send/);
    log.mock.restore(); rejectAll = false;
  });
});
