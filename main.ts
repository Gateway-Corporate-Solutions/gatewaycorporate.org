import { Application, Router } from 'oak';
import twilio from 'twilio';

const app = new Application();
const router = new Router();

const accountSid = Deno.env.get("TWILIO_ACCOUNT_SID") || "";
const authToken = Deno.env.get("TWILIO_AUTH_TOKEN") || "";
const twilioNumber = Deno.env.get("TWILIO_NUMBER") || "";
const notificationNumber = Deno.env.get("NOTIFICATION_NUMBER") || "";

interface UserRequest {
  name: string;
  email: string;
  message: string;
}

function handleUserRequest(r: URLSearchParams) {
  const twilioClient = twilio(accountSid, authToken);

  twilioClient.messages.create({
    body: `New request from ${r.get('name')} (${r.get('email')}): ${r.get('message')}`,
    from: twilioNumber,
    to: notificationNumber
  })
}

router.get('/', async (context) => {
  const indexBody = await Deno.readTextFile('./src/views/index.html');
  context.response.body = indexBody;
});

router.post('/request', async (context) => {
  try {
    const form = await context.request.body.form();
    handleUserRequest(form);
    const indexBody = await Deno.readTextFile('./src/views/index.html');
    context.response.body = indexBody;
  } catch (error) {
    console.error('Error processing request:', error);
    context.response.status = 500;
    context.response.body = 'Internal Server Error';
  }
});

app.use(router.routes());
app.use(router.allowedMethods());

app.use(async (context, next) => {
  const root = "./src/static";
  try {
    await context.send({ root });
  } catch {
    next();
  }
});

app.listen({ port: parseInt(Deno.env.get('PORT') ?? '8000') });
console.log('Server is running on http://localhost:8000');