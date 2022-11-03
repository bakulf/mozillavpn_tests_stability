/* This Source Code Form is subject to the terms of the Mozilla Public
 * License, v. 2.0. If a copy of the MPL was not distributed with this
 * file, You can obtain one at http://mozilla.org/MPL/2.0/. */

import { Octokit } from "https://cdn.skypack.dev/@octokit/core";
const octokit = new Octokit({});

async function render() {

  let data = await fetch('data.json').then(r => r.json());
  let total_count = 0;
  let page = 0;

  if (!(new URLSearchParams(location.search).has("live")) && data.length) {
    maybeProcessData(data);
    return;
  }

  const maybeStored = localStorage.getItem("workflows");
  if (maybeStored) {
    const stored = JSON.parse(maybeStored);
    const stored_age = new Date() - new Date(stored.date);
    // The branches should be cached for 1 hour
    if (stored_age < 1000 * 60 * 60 * 1) {
      data = stored.data;
      total_count = stored.total_count;
      page = stored.page;
    }
  }

  do {
    maybeProcessData(data);

    const response = await octokit.request(
      "GET /repos/{owner}/{repo}/actions/runs",
      {
        owner: "mozilla-mobile",
        repo: "mozilla-vpn-client",
        per_page: 100000,
        page: page++,
      },
    );

    total_count = response.data.total_count;
    response.data.workflow_runs.forEach(wf => {
      if (wf.head_branch === 'main') {
        data.push({name: wf.name, run_started_at: wf.run_started_at, html_url: wf.html_url, who: wf.who, status: wf.status, conclusion: wf.conclusion});
      }
    });
    console.log(total_count, data.length);

    localStorage.setItem(
      "workflows",
      JSON.stringify({
        date: new Date(),
        data,
        total_count,
        page,
      }),
    );
  } while (data.length < total_count && data.length);

}

function title(workflows) {
  const minDate = Object.keys(workflows).reduce((pre, cur) => {
    const value = workflows[cur].reduce((pre, cur) => pre && pre.date < cur.date ? pre : cur, null)
    return pre && pre < value.date ? pre : value.date;
  }, null);
  minDate.setUTCHours(0, 0, 0, 0);
  const maxDate = Object.keys(workflows).reduce((pre, cur) => {
    const value = workflows[cur].reduce((pre, cur) => pre && pre.date > cur.date ? pre : cur, null)
    return pre && pre > value.date ? pre : value.date;
  }, null);
  maxDate.setUTCHours(0, 0, 0, 0);
  maxDate.setDate(maxDate.getDate() + 1);
  return `From ${minDate} to ${maxDate}`;
}

function createChart(name, workflow) {
  let div = document.getElementById(name);
  if (!div) {
    div = document.createElement('div');
    div.setAttribute('id', name);
    document.getElementById('container').appendChild(div);
  }

  while (div.firstChild) div.firstChild.remove();

  const title = document.createElement('h3');
  title.textContent = name;
  div.appendChild(title);

  const chart = document.createElement('canvas');
  div.appendChild(chart);

  const minDate = new Date(workflow.reduce((pre, cur) => pre && pre.date < cur.date ? pre : cur, null).date);
  minDate.setUTCHours(0, 0, 0, 0);
  const maxDate = new Date(workflow.reduce((pre, cur) => pre && pre.date > cur.date ? pre : cur, null).date);
  maxDate.setUTCHours(0, 0, 0, 0);
  maxDate.setDate(maxDate.getDate() + 1);

  const data = {
    labels: [],
    datasets: [{
      label: "Success tasks",
      borderColor: 'rgb(99, 255, 132)',
      data: [],
    }, {
      label: "Failure tasks",
      borderColor: 'rgb(255, 99, 132)',
      data: [],
    }]
  };

  for (let date = new Date(minDate); date <= maxDate; date.setDate(date.getDate() + 1)) {
    data.labels.push(new Date(date));
    data.datasets[0].data.push(workflow.reduce((pre, cur) => cur.conclusion == 'success' && cur.date.getTime() >= date.getTime() && cur.date.getTime() < date.getTime() + 86400000 ? pre + 1 : pre, 0));
    data.datasets[1].data.push(workflow.reduce((pre, cur) => cur.conclusion == 'failure' && cur.date.getTime() >= date.getTime() && cur.date.getTime() < date.getTime() + 86400000 ? pre + 1 : pre, 0));
  }

  const config = {
    type: 'line',
    data,
    options: {},
  };
  new Chart(chart, config);
}

function maybeProcessData(data) {
  const workflows = {};
  data.forEach(wf => {
    if (!(wf.name in workflows)) {
      workflows[wf.name] = [];
    }

    workflows[wf.name].push({
      date: new Date(wf.run_started_at),
      url: wf.html_url,
      who: wf.triggering_actor,
      status: wf.status,
      conclusion: wf.conclusion
    });
  });

  if (data.length) {
    document.getElementById('title').textContent = title(workflows);
    Object.keys(workflows).map(name => createChart(name, workflows[name]));
  }
}

render();
