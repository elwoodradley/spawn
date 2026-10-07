import { describe, expect, it } from "vitest";

import { MetricsModel, type Series } from "./metrics";
import { classify, groupLines, groupSeries, reuseGroups } from "./pairs";

const s = (name: string): Series => ({ name, points: [{ step: 1, value: 1 }] });

describe("classify", () => {
  it("recognises train and val affixes in every spelling", () => {
    expect(classify("train_loss")).toEqual({ side: "train", metric: "loss" });
    expect(classify("train/loss")).toEqual({ side: "train", metric: "loss" });
    expect(classify("tr_acc")).toEqual({ side: "train", metric: "acc" });
    expect(classify("val_loss")).toEqual({ side: "val", metric: "loss" });
    expect(classify("valid_f1")).toEqual({ side: "val", metric: "f1" });
    expect(classify("validation_acc")).toEqual({ side: "val", metric: "acc" });
    expect(classify("val/acc")).toEqual({ side: "val", metric: "acc" });
    expect(classify("loss_train")).toEqual({ side: "train", metric: "loss" });
    expect(classify("loss_val")).toEqual({ side: "val", metric: "loss" });
    expect(classify("acc/train")).toEqual({ side: "train", metric: "acc" });
    expect(classify("acc/val")).toEqual({ side: "val", metric: "acc" });
  });

  it("leaves bare names alone", () => {
    expect(classify("loss")).toEqual({ side: null, metric: "loss" });
    expect(classify("lr")).toEqual({ side: null, metric: "lr" });
    expect(classify("trainer_steps")).toEqual({ side: null, metric: "trainer_steps" });
  });
});

describe("groupSeries", () => {
  it("pairs bare loss with val_loss and acc with val_acc", () => {
    const groups = groupSeries([s("loss"), s("val_acc"), s("acc"), s("val_loss")]);
    expect(groups.map((g) => g.metric)).toEqual(["loss", "acc"]);
    expect(groups[0]?.train?.name).toBe("loss");
    expect(groups[0]?.val?.name).toBe("val_loss");
    expect(groups[1]?.train?.name).toBe("acc");
    expect(groups[1]?.val?.name).toBe("val_acc");
  });

  it("pairs explicit train and val affixes", () => {
    const [g] = groupSeries([s("val/acc"), s("train/acc")]);
    expect(g?.train?.name).toBe("train/acc");
    expect(g?.val?.name).toBe("val/acc");
    expect(g?.others).toEqual([]);
  });

  it("gives unpaired series their own group", () => {
    const groups = groupSeries([s("lr"), s("loss")]);
    expect(groups.map((g) => g.metric)).toEqual(["loss", "lr"]);
    expect(groups[1]?.others.map((x) => x.name)).toEqual(["lr"]);
    expect(groups[1]?.train).toBeUndefined();
  });

  it("orders loss-like groups first, then alphabetically", () => {
    const groups = groupSeries([s("f1"), s("acc"), s("nll"), s("loss")]);
    expect(groups.map((g) => g.metric)).toEqual(["loss", "nll", "acc", "f1"]);
  });

  it("does not steal a bare series when no val side exists", () => {
    const groups = groupSeries([s("loss"), s("train_loss")]);
    expect(groups).toHaveLength(1);
    expect(groups[0]?.train?.name).toBe("train_loss");
    expect(groups[0]?.others.map((x) => x.name)).toEqual(["loss"]);
  });

  it("keeps a duplicate side as an extra line rather than dropping it", () => {
    const [g] = groupSeries([s("val_loss"), s("valid_loss"), s("loss")]);
    expect(g?.val?.name).toBe("val_loss");
    expect(g?.others.map((x) => x.name)).toEqual(["valid_loss"]);
    expect(g?.train?.name).toBe("loss");
  });

  it("matches metric names case-insensitively", () => {
    const [g] = groupSeries([s("Loss"), s("val_loss")]);
    expect(g?.train?.name).toBe("Loss");
    expect(g?.val?.name).toBe("val_loss");
  });
});

describe("groupLines", () => {
  it("returns train, val, then the rest", () => {
    const [g] = groupSeries([s("lr"), s("val_loss"), s("loss")]);
    expect(groupLines(g as NonNullable<typeof g>).map((x) => x.name)).toEqual(["loss", "val_loss"]);
  });
});

describe("reuseGroups", () => {
  it("keeps a group's object while only its points change", () => {
    const m = new MetricsModel();
    m.feed("loss: 1 val_loss: 2 acc: 0.5\n");
    const first = groupSeries(m.series);
    m.feed("loss: 0.9 val_loss: 1.8 acc: 0.6\n");
    const fresh = groupSeries(m.series);
    expect(fresh[0]).not.toBe(first[0]);
    const kept = reuseGroups(first, fresh);
    expect(kept[0]).toBe(first[0]);
    expect(kept[1]).toBe(first[1]);
  });

  it("replaces a group whose series changed", () => {
    const loss = s("loss");
    const before = groupSeries([loss]);
    const after = reuseGroups(before, groupSeries([loss, s("val_loss")]));
    expect(after[0]).not.toBe(before[0]);
    expect(after[0]?.val?.name).toBe("val_loss");
  });
});
