def binary_search_sim(goal: int, min: int, max: int) -> int:
    position = (max-min) / 2

    i = 1
    while True:
        print(f"({i}) {position=:.2f}, {goal=}, {min=:.2f}, {max=:.2f}")

        if int(round(position)) == goal:
            break
        elif int(round(position)) > goal:
            max = position
        elif int(round(position)) < goal:
            min = position
        position = min + (max-min)/2

        i+=1

    return i

steps_required = {
    goal: binary_search_sim(goal, 1, 100)
    for goal in range(1, 100 + 1)
}
costs = {goal: 6 - steps for goal, steps in steps_required.items()}
payout = sum(costs.values()) / len(costs)

print(f"Payout: {payout}$")
