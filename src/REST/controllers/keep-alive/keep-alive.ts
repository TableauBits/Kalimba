import { Router } from "express";

export const KEEP_ALIVE_PATH = "keep-alive";
const keepAliveController = Router();
function* lyrics() {
	while (true) {
		yield "This was a triumph!";
		yield "I'm making a note here:";
		yield "Huge success!";
		yield "It's hard to overstate";
		yield "My satisfaction.";
		yield "Aperture Science:";
		yield "We do what we must";
		yield "Because we can";
		yield "For the good of all of us.";
		yield "Except the ones who are dead.";
		yield "But there's no sense crying";
		yield "Over every mistake.";
		yield "You just keep on trying";
		yield "'Til you run out of cake.";
		yield "And the science gets done.";
		yield "And you make a neat gun";
		yield "For the people who are";
		yield "Still alive.";
		yield "I'm not even angry...";
		yield "I'm being so sincere right now.";
		yield "Even though you broke my heart,";
		yield "And killed me.";
		yield "And tore me to pieces.";
		yield "And threw every piece into a fire.";
		yield "As they burned it hurt because";
		yield "I was so happy for you!";
		yield "Now, these points of data";
		yield "Make a beautiful line.";
		yield "And we're out of beta.";
		yield "We're releasing on time!";
		yield "So I'm GLaD I got burned!";
		yield "Think of all the things we learned!";
		yield "For the people who are";
		yield "Still alive.";
		yield "Go ahead and leave me...";
		yield "I think I'd prefer to stay inside...";
		yield "Maybe you'll find someone else";
		yield "To help you.";
		yield "Maybe Black Mesa?";
		yield "That was a joke. Ha Ha. Fat Chance!";
		yield "Anyway this cake is great!";
		yield "It's so delicious and moist!";
		yield "Look at me: still talking";
		yield "When there's science to do!";
		yield "When I look out there,";
		yield "It makes me glad I'm not you.";
		yield "I've experiments to run.";
		yield "There is research to be done.";
		yield "On the people who are";
		yield "Still alive.";
		yield "And believe me I am";
		yield "Still alive.";
		yield "I'm doing science and I'm";
		yield "Still alive.";
		yield "I feel fantastic and I'm";
		yield "Still alive.";
		yield "While you're dying I'll be";
		yield "Still alive.";
		yield "And when you're dead I will be";
		yield "Still alive";
		yield "Still alive.";
		yield "Still alive.";
	}
}
const lyricGenerator = lyrics();

keepAliveController.get("/", async (_, res) => {
	res.send(lyricGenerator.next().value);
});

export { keepAliveController };
