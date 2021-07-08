import asyncio
import json
import pyrebase
import websockets

# authentication
config = {
    "apiKey": "AIzaSyBljB_Xo7WNymFihDf0GCTDpy2wFMHdCqg",
    "authDomain": "matbactivity.firebaseapp.com",
    "databaseURL": "https://matbactivity.firebaseio.com",
    "projectId": "matbactivity",
    "storageBucket": "matbactivity.appspot.com",
    "messagingSenderId": "1017121160583",
    "appId": "1:1017121160583:web:6f1b1a1d03a03b0a37e722",
    "measurementId": "G-J5C20QVC69"
}
firebase = pyrebase.initialize_app(config)
auth = firebase.auth()

idToken = auth.sign_in_with_email_and_password("bidonman@gmail.com", "bidonman")['idToken']

# websocket connection


async def connect():
    uri = "ws://localhost:3000"
    async with websockets.connect(uri) as websocket:
        await websocket.send(json.dumps({"event": "CLIENT-authenticate", "data": idToken}))
        print(f"authentication response: {await websocket.recv()}")

        while True:
            event = input("enter event type: ")
            data = input("enter event data (JSON string):")

            payload = json.dumps({"event": event, "data": json.loads(data)})
            print(f"sending payload: {payload}")
            await websocket.send(payload)
            print(f"reponse: {await websocket.recv()}")

asyncio.get_event_loop().run_until_complete(connect())
