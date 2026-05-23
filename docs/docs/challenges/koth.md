# KOTH template

King-of-the-hill. One shared contract, many players, one throne.
`isSolved(player)` returns true only for the current king. Dethrone
someone — your card lights up. Get dethroned — it flips back.

Path: `contracts-template/koth/`

## When to use this

- The puzzle is about **competing for** a position, not just **finding**
  a bug — outbidding, gas-racing, sandwich attacks, lock-and-hold.
- You want a **leaderboard mechanic** — one solver at a time, churn
  rewards activity.
- Combined with the [scoreboard webhook](../operations/webhook.md), the
  organizer can score first-blood and reclaim-events without polling.

## Anatomy

```solidity
contract Koth {
    address public king;

    event Crowned(address indexed newKing, address indexed oldKing);

    function claim() external virtual {
        _crown(msg.sender);
    }

    function _crown(address who) internal {
        address prev = king;
        king = who;
        emit Crowned(who, prev);
    }

    function isSolved(address who) external view returns (bool) {
        return who == king && who != address(0);
    }
}
```

The base contract enforces one invariant: `isSolved(player) == (player == king)`.
Everything else is yours to design.

## Pairing with the webhook

A KOTH challenge without the webhook makes a perfectly valid puzzle,
but the scoreboard sees only whoever happens to check `/api/flag` at
the exact moment they hold the throne — a race.

With the webhook enabled (`WEBHOOK_URL` set in `.env`):

```
player A claims          → solve.first  { player: A, solved: true,  previous: null }
player B claims          → solve.flip   { player: A, solved: false, previous: true }
                         → solve.first  { player: B, solved: true,  previous: null }
player A claims again    → solve.flip   { player: A, solved: true,  previous: false }
                         → solve.flip   { player: B, solved: false, previous: true }
```

Your scoreboard can award:

- **First blood**: the first `solve.first` per player.
- **Steal count**: number of times each player flipped `previous: true → false` on someone else.
- **Time on throne**: difference between adjacent `solve.first` and `solve.flip(true→false)` for a player.

## Adapting the bug

The default `claim()` is degenerate (anyone calling becomes king). For
actual challenges, override it with a scoring or constraint mechanism.
Examples:

=== "Highest score wins"

    ```solidity
    mapping(address => uint256) public score;
    uint256 public kingScore;

    function bump(uint256 amount) external {
        token.transferFrom(msg.sender, address(this), amount);
        score[msg.sender] += amount;
        if (score[msg.sender] > kingScore) {
            kingScore = score[msg.sender];
            _crown(msg.sender);
        }
    }

    function withdraw(uint256 amount) external {
        require(score[msg.sender] >= amount, "no balance");
        score[msg.sender] -= amount;
        token.transfer(msg.sender, amount);
        // bug: doesn't recompute the king if msg.sender was them.
        // Whoever bumps once then withdraws stays "frozen" as king
        // until someone bumps over kingScore.
    }
    ```

=== "Time-locked seat"

    ```solidity
    uint256 public heldUntil;
    uint256 public constant LOCK = 5 minutes;

    function claim() external {
        require(block.timestamp >= heldUntil, "throne held");
        _crown(msg.sender);
        heldUntil = block.timestamp + LOCK;
    }
    ```

=== "Pay-to-play"

    ```solidity
    uint256 public lastBid;

    function claim() external payable {
        require(msg.value > lastBid, "bid too low");
        if (king != address(0)) {
            payable(king).transfer(lastBid);
        }
        lastBid = msg.value;
        _crown(msg.sender);
    }
    ```

## Operational notes

- KOTH challenges are **shared mode** — single deployment, all players
  on the same target. Cheap to host.
- Set `WEBHOOK_POLL_INTERVAL_MS` lower (e.g. `5000`) if you want tighter
  leaderboards. The default 30s lag is fine for casual events.
- Flag values are still per-player gated by `isSolved`. If two players
  request `/api/flag/koth1?address=…` simultaneously and both happen to
  satisfy the check (impossible by construction, but consider edge
  cases in your `isSolved`), they both get the flag — first-blood is
  decided by the scoreboard, not the backend.
