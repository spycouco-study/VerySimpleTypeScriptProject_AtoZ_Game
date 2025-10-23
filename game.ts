interface GameState {
  AlphabetSet: string;
  CurrentIndex: number;
  IsActive: boolean;
}

costst outputEl = document.getElementById("alphabet-display") as HTMLElement;

const State: GameState = {
  AlphabetSet: "ABCDEFGHIJKLMNOPQRSTUVWXYZ",
  CurrentIndex: 0,
  IsActive: true,
};

window.addEventListener("keydown", () => {
  if (State.IsActive) Execute_Next_Step();
});

function Execute_Next_Step(): void {
  if (State.CurrentIndex < State.AlphabetSet.length) {
    Render_Character(State.AlphabetSet[State.CurrentIndex]);
    State.CurrentIndex++;
  } else {
    Render_Message("완료!");
    State.IsActive = false;
  }
}

function Render_Character(char: string): void {
  if (outputEl) {
    outputEl.textContent = char;
    outputEl.classList.remove("done");
  }
}

function Render_Message(msg: string): void {
  if (outputEl) {
    outputEl.textContent = msg;
    outputEl.classList.add("done");
  }
}
