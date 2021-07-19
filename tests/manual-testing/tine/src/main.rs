use futures::executor::block_on;
use serde::{Deserialize, Serialize};
use std::io::Write;
use std::{
	io::{stdin, stdout},
	sync::mpsc::channel,
};
use websocket::{Message, OwnedMessage};

#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
struct AuthRequest<'a> {
	email: &'a str,
	password: &'a str,
	return_secure_token: bool,
}

#[allow(dead_code)]
#[derive(Deserialize)]
#[serde(rename_all = "camelCase")]
struct AuthResponse {
	local_id: String,
	email: String,
	display_name: String,
	id_token: String,
	registered: bool,
	refresh_token: String,
	expires_in: String,
}

async fn get_id_token() -> String {
	// Safe to expose
	const API_KEY: &str = "AIzaSyBljB_Xo7WNymFihDf0GCTDpy2wFMHdCqg";
	const AUTH_ENDPOINT: &str =
		"https://identitytoolkit.googleapis.com/v1/accounts:signInWithPassword?key=";

	let final_endpoint = format!("{}{}", AUTH_ENDPOINT, API_KEY);
	let req_obj = AuthRequest {
		email: "bidonman@gmail.com",
		password: "bidonman",
		return_secure_token: true,
	};
	let client = reqwest::Client::new();
	client
		.post(final_endpoint)
		.json(&req_obj)
		.send()
		.await
		.unwrap()
		.json::<AuthResponse>()
		.await
		.unwrap()
		.id_token
}

fn setup_ws(id_token: &str) {
	const WS_ENDPOINT: &str = "ws://127.0.0.1:3000";
	let ws_client = websocket::ClientBuilder::new(WS_ENDPOINT)
		.unwrap()
		.connect_insecure()
		.unwrap();
	println!("connected to {}", WS_ENDPOINT);

	let (mut receiver, mut sender) = ws_client.split().unwrap();
	let (tx, rx) = channel();
	let tx_clone = tx.clone();

	let send_loop = std::thread::spawn(move || {
		loop {
			// Send loop
			let message = match rx.recv() {
				Ok(m) => m,
				Err(e) => {
					println!("Send Loop: {:?}", e);
					return;
				}
			};
			match message {
				OwnedMessage::Close(_) => {
					sender.send_message(&message).unwrap();
					// If it's a close message, just send it and then return.
					return;
				}
				_ => (),
			}
			// Send the message
			match sender.send_message(&message) {
				Ok(()) => (),
				Err(e) => {
					println!("Send Loop: {:?}", e);
					let _ = sender.send_message(&Message::close());
					return;
				}
			}
		}
	});

	let receive_loop = std::thread::spawn(move || {
		// Receive loop
		for message in receiver.incoming_messages() {
			let message = match message {
				Ok(m) => m,
				Err(e) => {
					println!("Receive Loop: {:?}", e);
					tx_clone.send(OwnedMessage::Close(None)).unwrap();
					return;
				}
			};
			match message {
				OwnedMessage::Close(_) => {
					// Got a close message, so send a close message and return
					tx_clone.send(OwnedMessage::Close(None)).unwrap();
					return;
				}
				OwnedMessage::Ping(data) => {
					match tx_clone.send(OwnedMessage::Pong(data)) {
						// Send a pong in response
						Ok(()) => (),
						Err(e) => {
							println!("Receive Loop: {:?}", e);
							return;
						}
					}
				}
				OwnedMessage::Text(text) => {
					println!("\n<< {:?}", text)
				}
				// Say what we received
				_ => println!("\n<< {:?}", message),
			}
		}
	});

	tx.send(OwnedMessage::Text(format!(
		r#"{{"event":"CLIENT-authenticate","data":{{"idToken":"{}"}}}}"#,
		id_token
	)))
	.unwrap();

	loop {
		let mut event = String::new();
		print!("Enter event type: ");
		stdout().flush().unwrap();
		stdin().read_line(&mut event).unwrap();

		let trimmed_event = event.trim();

		let mut data = String::new();
		print!("Enter event data (JSON): ");
		stdout().flush().unwrap();
		stdin().read_line(&mut data).unwrap();

		let trimmed_data = data.trim();

		let message = match trimmed_event {
			"close" => {
				// Close the connection
				tx.send(OwnedMessage::Close(None)).unwrap();
				break;
			}
			// Send a ping
			"ping" => OwnedMessage::Ping(b"PING".to_vec()),
			// Otherwise, just send text
			_ => {
				let message_string =
					format!(r#"{{"event":"{}","data":{}}}"#, trimmed_event, trimmed_data);
				println!("\n>> {}", message_string);
				OwnedMessage::Text(message_string)
			}
		};

		match tx.send(message) {
			Ok(()) => (),
			Err(e) => {
				println!("Main Loop: {:?}", e);
				break;
			}
		}
	}

	println!("Waiting for child threads to exit");

	send_loop.join().unwrap();
	receive_loop.join().unwrap();

	println!("Exited");
}

#[tokio::main]
async fn main() {
	let id_token = block_on(get_id_token());
	println!("{}", id_token);
	setup_ws(id_token.as_str());
}
