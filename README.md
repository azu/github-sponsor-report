# github-sponsor-report

Make your GitHub Sponsors report page.

## Usage

1. [Create a report repository using this Template](https://github.com/azu/github-sponsor-report-template/generate)
    - Recommend: create a repository as `private`
    - :warning: Some data includes private data
2. Set `PERSONAL_GITHUB_TOKEN` to your repo's secrets
    - [New personal access token](https://github.com/settings/tokens/new) → select `read:org` and `user` permission
    - <https://github.com/{yourname}/{repo}/settings/secrets/actions>
3. Update data manually
    1. Go to <https://github.com/{yourname}/{repo}/actions/workflows/update-data.yml>
    2. Run workflow

After the setup, update data every hour by GitHub Actions.

## Contributing

Pull requests and stars are always welcome.

For bugs and feature requests, [please create an issue](https://github.com/azu/sponspor-report/issues).

1. Fork it!
2. Create your feature branch: `git checkout -b my-new-feature`
3. Commit your changes: `git commit -am 'Add some feature'`
4. Push to the branch: `git push origin my-new-feature`
5. Submit a pull request :D

## Author

- azu: [GitHub](https://github.com/azu), [Twitter](https://twitter.com/azu_re)

## License

MIT © azu
