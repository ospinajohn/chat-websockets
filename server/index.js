import express from 'express'; // importar express
import logger from 'morgan'; // importar morgan para ver las peticiones que llegan al servidor
import path from 'path'; // importar path para poder utilizar rutas de archivos

import { Server } from 'socket.io'; // importar socket.io para poder utilizar websockets
import { createServer } from 'http'; // importar http para poder crear un servidor http

import dotenv from 'dotenv';
import { createClient } from '@libsql/client';

const port = process.env.PORT ?? 3000; // definir puerto de escucha en caso de que no exista el puerto en el entorno

dotenv.config();

const app = express(); // crear instancia de express para poder utilizar sus métodos
const server = createServer(app); // crear servidor http con express
const io = new Server(server, {
	cors: {
		// configurar cors para que cualquier cliente se pueda conectar al servidor
		origin: '*',
		methods: ['GET', 'POST'],
	},
	connectionStateRecovery: {
		// configurar reconexión automática
		retries: 3, // número de intentos de reconexión
		delay: 1000, // tiempo de espera entre intentos
	},
}); // crear instancia de socket.io para poder utilizar sus métodos

const db = createClient({
	url: 'link que se genera en turso',
	authToken: process.env.DB_TOKEN,
});

await db.execute(`
  CREATE TABLE IF NOT EXISTS messages (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    content TEXT,
    user TEXT
  )
`);

io.on('connection', async socket => {
	console.log('a user has connected!');

	socket.on('disconnect', () => {
		console.log('an user has disconnected');
	});

	socket.on('chat message', async msg => {
		let result;
		const username = socket.handshake.auth.username ?? 'anonymous';
		console.log({ username });
		try {
			result = await db.execute({
				sql: 'INSERT INTO messages (content, user) VALUES (:msg, :username)',
				args: { msg, username },
			});
		} catch (e) {
			console.error(e);
			return;
		}

		io.emit('chat message', msg, result.lastInsertRowid.toString(), username);
	});

	if (!socket.recovered) {
		// <- recuperase los mensajes sin conexión
		try {
			const results = await db.execute({
				sql: 'SELECT id, content, user FROM messages WHERE id > ?',
				args: [socket.handshake.auth.serverOffset ?? 0],
			});

			results.rows.forEach(row => {
				socket.emit('chat message', row.content, row.id.toString(), row.user);
			});
		} catch (e) {
			console.error(e);
		}
	}
});

app.use(logger('dev'));

app.get('/', (req, res) => {
	const indexPath = path.join(process.cwd(), '..', 'client', 'index.html');
	res.sendFile(indexPath);
});

server.listen(port, () => {
	// definir puerto de escucha y callback para saber cuando se levanta el servidor correctamente
	console.log(`Server http://localhost:${port}`);
});
