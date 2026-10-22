// Herança: classe base + classe derivada com polimorfismo.

Animal[] animais =
{
    new Cachorro("Rex"),
    new Gato("Mimi")
};

foreach (var animal in animais)
{
    Console.WriteLine($"{animal.Nome} faz: {animal.Som()}");
}

abstract class Animal
{
    protected Animal(string nome) => Nome = nome;

    public string Nome { get; }

    public virtual string Som() => "...";
}

class Cachorro : Animal
{
    public Cachorro(string nome) : base(nome) { }

    public override string Som() => "Au au";
}

class Gato : Animal
{
    public Gato(string nome) : base(nome) { }

    public override string Som() => "Miau";
}
