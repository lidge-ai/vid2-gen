/** Exact response of m*x'' + c*x' + k*(x-target) = 0 over one constant-target step. */
export interface SpringState { value: number; velocity: number }
export interface SpringParams {
  stiffness: number;
  damping: number;
  mass: number;
  snapDistance?: number;
  snapVelocity?: number;
}

export function stepSpring(state: SpringState, target: number, dt: number, params: SpringParams): SpringState {
  const { stiffness: k, damping: c, mass: m } = params;
  if (![state.value, state.velocity, target, dt, k, c, m].every(Number.isFinite) || dt < 0 || k <= 0 || c < 0 || m <= 0) {
    throw new RangeError("spring needs finite state, nonnegative time/damping, and positive stiffness/mass");
  }
  if (dt === 0) return state;
  const error = state.value - target;
  const alpha = c / (2 * m);
  const omega2 = k / m;
  const discriminant = alpha * alpha - omega2;
  let displacement: number;
  let velocity: number;
  if (discriminant < -1e-10) {
    const beta = Math.sqrt(-discriminant);
    const decay = Math.exp(-alpha * dt);
    const cos = Math.cos(beta * dt);
    const sin = Math.sin(beta * dt);
    displacement = decay * (error * cos + ((state.velocity + alpha * error) / beta) * sin);
    velocity = decay * (state.velocity * cos - ((alpha * state.velocity + omega2 * error) / beta) * sin);
  } else if (discriminant > 1e-10) {
    const root = Math.sqrt(discriminant);
    const slow = -alpha + root;
    const fast = -alpha - root;
    const a = (state.velocity - fast * error) / (slow - fast);
    const b = error - a;
    displacement = a * Math.exp(slow * dt) + b * Math.exp(fast * dt);
    velocity = slow * a * Math.exp(slow * dt) + fast * b * Math.exp(fast * dt);
  } else {
    const b = state.velocity + alpha * error;
    const decay = Math.exp(-alpha * dt);
    displacement = (error + b * dt) * decay;
    velocity = (b - alpha * (error + b * dt)) * decay;
  }
  if (Math.abs(displacement) < (params.snapDistance ?? 1e-5) && Math.abs(velocity) < (params.snapVelocity ?? 1e-4)) {
    return { value: target, velocity: 0 };
  }
  return { value: target + displacement, velocity };
}
